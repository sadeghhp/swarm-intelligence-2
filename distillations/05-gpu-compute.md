# GPU Compute Pipeline

## Overview

The simulation includes WebGPU-accelerated compute for large flocks (5000+ birds). The GPU pipeline runs flocking physics in parallel WGSL compute shaders.

```
┌─────────────────────────────────────────────────────────────────┐
│                    GPU SIMULATION PIPELINE                       │
└─────────────────────────────────────────────────────────────────┘

  CPU                                      GPU
┌──────────┐                          ┌──────────────┐
│ BirdArrays│──► uploadBirdData() ──►│ GPU Buffers  │
│  (SoA)   │                          │  (Storage)   │
└──────────┘                          └──────┬───────┘
                                             │
                                             ▼
                                      ┌──────────────┐
                                      │   Flocking   │
                                      │   Compute    │
                                      │   Shader     │
                                      └──────┬───────┘
                                             │
                                             ▼
                                      ┌──────────────┐
                                      │   Physics    │
                                      │   Compute    │
                                      │   Shader     │
                                      └──────┬───────┘
                                             │
┌──────────┐                                 │
│ BirdArrays│◄── downloadResults() ◄────────┘
│  (SoA)   │
└──────────┘
```

---

## WebGPU Initialization

### Capability Check

```typescript
static async checkGPUAvailability(): Promise<IGPUCapabilities> {
  if (!navigator.gpu) {
    return {
      available: false,
      adapter: null,
      reason: 'WebGPU not supported in this browser'
    };
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      return {
        available: false,
        adapter: null,
        reason: 'No WebGPU adapter found'
      };
    }

    // Get adapter info
    let adapterInfo = 'WebGPU Adapter';
    try {
      const info = (adapter as any).info;
      if (info) {
        adapterInfo = `${info.vendor || 'Unknown'} ${info.device || 'GPU'}`;
      }
    } catch {
      adapterInfo = 'WebGPU Compatible GPU';
    }
    
    return { available: true, adapter: adapterInfo };
  } catch (error) {
    return { available: false, adapter: null, reason: `GPU initialization failed: ${error}` };
  }
}
```

### Device Initialization

```typescript
async initialize(width: number, height: number): Promise<boolean> {
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: 'high-performance'
  });
  
  if (!adapter) return false;

  this.device = await adapter.requestDevice({
    requiredLimits: {
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
      maxComputeWorkgroupsPerDimension: adapter.limits.maxComputeWorkgroupsPerDimension
    }
  });

  await this.createPipelines();
  this.createBuffers();
  
  return true;
}
```

---

## Buffer Structure

### GPU Buffer Layout

```typescript
// Position buffer: [x, y] per bird (Float32, 8 bytes per bird)
this.positionBuffer = makeStorageBuffer(
  this.device, 
  new Float32Array(maxBirds * 2),
  GPUBufferUsage.COPY_SRC  // For readback
);

// Velocity buffer: [vx, vy] per bird (Float32, 8 bytes per bird)
this.velocityBuffer = makeStorageBuffer(
  this.device,
  new Float32Array(maxBirds * 2),
  GPUBufferUsage.COPY_SRC
);

// Acceleration buffer: [ax, ay] per bird (Float32, 8 bytes per bird)
this.accelerationBuffer = makeStorageBuffer(
  this.device,
  new Float32Array(maxBirds * 2),
  GPUBufferUsage.COPY_SRC
);

// State buffer: 8 floats per bird (32 bytes per bird)
// [panicLevel, energy, feedingState, matingState, localDensity, heading, gender, targetId]
this.stateBuffer = makeStorageBuffer(
  this.device,
  new Float32Array(maxBirds * 8),
  GPUBufferUsage.COPY_SRC
);

// Config buffer: uniform data (256 bytes)
this.configBuffer = makeUniformBuffer(
  this.device,
  new Float32Array(64)
);

// Predator buffer: up to 10 predators × 8 floats (320 bytes)
this.predatorBuffer = makeStorageBuffer(
  this.device,
  new Float32Array(10 * 8),
  GPUBufferUsage.COPY_SRC
);

// Food buffer: up to 20 sources × 8 floats (640 bytes)
this.foodBuffer = makeStorageBuffer(
  this.device,
  new Float32Array(20 * 8),
  GPUBufferUsage.COPY_SRC
);

// Staging buffer for CPU readback
this.stagingBuffer = this.device.createBuffer({
  size: maxBirds * 8 * 4,
  usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
});
```

### Memory Layout Summary

| Buffer | Per-Bird Size | Max Birds | Total Size |
|--------|---------------|-----------|------------|
| Position | 8 bytes | 10,000 | 80 KB |
| Velocity | 8 bytes | 10,000 | 80 KB |
| Acceleration | 8 bytes | 10,000 | 80 KB |
| State | 32 bytes | 10,000 | 320 KB |
| **Total per bird** | **56 bytes** | - | **560 KB** |

---

## Data Upload

### Upload Bird Data

```typescript
uploadBirdData(birds: BirdArrays): void {
  this.birdCount = birds.count;

  // Interleave position data
  const positionData = new Float32Array(birds.count * 2);
  for (let i = 0; i < birds.count; i++) {
    positionData[i * 2] = birds.positionX[i];
    positionData[i * 2 + 1] = birds.positionY[i];
  }
  uploadBuffer(this.device, this.positionBuffer, positionData.buffer);

  // Interleave velocity data
  const velocityData = new Float32Array(birds.count * 2);
  for (let i = 0; i < birds.count; i++) {
    velocityData[i * 2] = birds.velocityX[i];
    velocityData[i * 2 + 1] = birds.velocityY[i];
  }
  uploadBuffer(this.device, this.velocityBuffer, velocityData.buffer);

  // Clear acceleration
  clearBuffer(this.device, this.accelerationBuffer, 0, birds.count * 2 * 4);

  // State data: [panicLevel, energy, feedingState, matingState, localDensity, heading, gender, targetId]
  const stateData = new Float32Array(birds.count * 8);
  for (let i = 0; i < birds.count; i++) {
    const offset = i * 8;
    stateData[offset] = birds.panicLevel[i];
    stateData[offset + 1] = birds.energy[i];
    stateData[offset + 2] = birds.feedingState[i];
    stateData[offset + 3] = birds.matingState[i];
    stateData[offset + 4] = birds.localDensity[i];
    stateData[offset + 5] = birds.heading[i];
    stateData[offset + 6] = birds.gender[i];
    stateData[offset + 7] = birds.targetFoodId[i];
  }
  uploadBuffer(this.device, this.stateBuffer, stateData.buffer);
}
```

### Upload Configuration

```typescript
uploadConfig(simConfig: ISimulationConfig, envConfig: IEnvironmentConfig, deltaTime: number): void {
  const configData = new Float32Array(64);
  
  // Simulation params (0-15)
  configData[0] = this.birdCount;
  configData[1] = this.width;
  configData[2] = this.height;
  configData[3] = deltaTime;
  configData[4] = simConfig.maxSpeed;
  configData[5] = simConfig.maxForce;
  configData[6] = simConfig.perceptionRadius;
  configData[7] = simConfig.separationRadius;
  configData[8] = simConfig.alignmentWeight;
  configData[9] = simConfig.cohesionWeight;
  configData[10] = simConfig.separationWeight;
  configData[11] = simConfig.fieldOfView * Math.PI / 180;  // To radians
  configData[12] = simConfig.boundaryMargin;
  configData[13] = simConfig.boundaryForce;
  configData[14] = simConfig.simulationSpeed;
  configData[15] = simConfig.energyEnabled ? 1 : 0;

  // Environment params (16-31)
  configData[16] = envConfig.windSpeed;
  configData[17] = envConfig.windDirection * Math.PI / 180;
  configData[18] = envConfig.windTurbulence;
  configData[19] = envConfig.predatorEnabled ? 1 : 0;
  configData[20] = envConfig.panicRadius;
  configData[21] = envConfig.panicDecay;
  // ... more config fields ...

  uploadBuffer(this.device, this.configBuffer, configData.buffer);
}
```

---

## Compute Pipelines

### Pipeline Creation

```typescript
private async createPipelines(): Promise<void> {
  // Flocking compute shader
  const flockingShader = this.device.createShaderModule({
    label: 'Flocking Compute Shader',
    code: this.getFlockingShaderCode()
  });

  this.flockingPipeline = this.device.createComputePipeline({
    label: 'Flocking Pipeline',
    layout: 'auto',
    compute: {
      module: flockingShader,
      entryPoint: 'main'
    }
  });

  // Physics update shader
  const physicsShader = this.device.createShaderModule({
    label: 'Physics Compute Shader',
    code: this.getPhysicsShaderCode()
  });

  this.physicsPipeline = this.device.createComputePipeline({
    label: 'Physics Pipeline',
    layout: 'auto',
    compute: {
      module: physicsShader,
      entryPoint: 'main'
    }
  });
}
```

### Running Simulation Step

```typescript
async runSimulationStep(): Promise<void> {
  // Create bind group with all buffers
  const bindGroup = this.device.createBindGroup({
    layout: this.flockingPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: this.positionBuffer } },
      { binding: 1, resource: { buffer: this.velocityBuffer } },
      { binding: 2, resource: { buffer: this.accelerationBuffer } },
      { binding: 3, resource: { buffer: this.stateBuffer } },
      { binding: 4, resource: { buffer: this.configBuffer } },
      { binding: 5, resource: { buffer: this.predatorBuffer } },
      { binding: 6, resource: { buffer: this.foodBuffer } }
    ]
  });

  const commandEncoder = this.device.createCommandEncoder();

  // Pass 1: Calculate flocking forces
  const flockingPass = commandEncoder.beginComputePass();
  flockingPass.setPipeline(this.flockingPipeline);
  flockingPass.setBindGroup(0, bindGroup);
  flockingPass.dispatchWorkgroups(Math.ceil(this.birdCount / 64));
  flockingPass.end();

  // Pass 2: Apply forces and update positions
  const physicsPass = commandEncoder.beginComputePass();
  physicsPass.setPipeline(this.physicsPipeline);
  physicsPass.setBindGroup(0, physicsBindGroup);
  physicsPass.dispatchWorkgroups(Math.ceil(this.birdCount / 64));
  physicsPass.end();

  this.device.queue.submit([commandEncoder.finish()]);
}
```

---

## WGSL Flocking Shader

```wgsl
// Buffer bindings
@group(0) @binding(0) var<storage, read_write> positions: array<vec2f>;
@group(0) @binding(1) var<storage, read> velocities: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> accelerations: array<vec2f>;
@group(0) @binding(3) var<storage, read_write> states: array<f32>;
@group(0) @binding(4) var<uniform> config: array<f32, 64>;
@group(0) @binding(5) var<storage, read> predators: array<f32>;
@group(0) @binding(6) var<storage, read> food: array<f32>;

// Config accessors
fn getBirdCount() -> u32 { return u32(config[0]); }
fn getWidth() -> f32 { return config[1]; }
fn getHeight() -> f32 { return config[2]; }
fn getMaxSpeed() -> f32 { return config[4]; }
fn getMaxForce() -> f32 { return config[5]; }
fn getPerceptionRadius() -> f32 { return config[6]; }
fn getSeparationRadius() -> f32 { return config[7]; }
fn getAlignmentWeight() -> f32 { return config[8]; }
fn getCohesionWeight() -> f32 { return config[9]; }
fn getSeparationWeight() -> f32 { return config[10]; }
fn getFOV() -> f32 { return config[11]; }
fn getBoundaryMargin() -> f32 { return config[12]; }
fn getBoundaryForce() -> f32 { return config[13]; }

// State accessors (8 floats per bird)
fn getPanicLevel(idx: u32) -> f32 { return states[idx * 8u]; }
fn setPanicLevel(idx: u32, val: f32) { states[idx * 8u] = val; }
fn setLocalDensity(idx: u32, val: f32) { states[idx * 8u + 4u] = val; }

// Vector utilities
fn limit(v: vec2f, maxMag: f32) -> vec2f {
  let magSq = dot(v, v);
  if (magSq > maxMag * maxMag) {
    return normalize(v) * maxMag;
  }
  return v;
}

fn setMag(v: vec2f, mag: f32) -> vec2f {
  let len = length(v);
  if (len > 0.0001) {
    return v * (mag / len);
  }
  return v;
}

// Field of view check
fn isInFOV(myPos: vec2f, myVel: vec2f, otherPos: vec2f, fov: f32) -> bool {
  let velMagSq = dot(myVel, myVel);
  if (velMagSq < 0.01) { return true; }
  
  let toOther = otherPos - myPos;
  let heading = atan2(myVel.y, myVel.x);
  let angleToOther = atan2(toOther.y, toOther.x);
  
  var diff = angleToOther - heading;
  if (diff > 3.14159) { diff -= 6.28318; }
  else if (diff < -3.14159) { diff += 6.28318; }
  
  let halfFov = fov * 0.5;
  return diff > -halfFov && diff < halfFov;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3u) {
  let idx = global_id.x;
  let count = getBirdCount();
  
  if (idx >= count) { return; }

  let myPos = positions[idx];
  let myVel = velocities[idx];
  let perceptionRadius = getPerceptionRadius();
  let separationRadius = getSeparationRadius();
  let fov = getFOV();
  let maxSpeed = getMaxSpeed();
  let maxForce = getMaxForce();

  // Accumulators for flocking rules
  var alignment = vec2f(0.0, 0.0);
  var cohesion = vec2f(0.0, 0.0);
  var separation = vec2f(0.0, 0.0);
  var alignWeight: f32 = 0.0;
  var cohesionWeight: f32 = 0.0;
  var separationCount: u32 = 0u;
  var neighborCount: u32 = 0u;

  // Check all other birds (O(N) per bird, but parallelized!)
  for (var i: u32 = 0u; i < count; i++) {
    if (i == idx) { continue; }

    let otherPos = positions[i];
    let diff = myPos - otherPos;
    let distSq = dot(diff, diff);
    let dist = sqrt(distSq);

    if (dist > perceptionRadius) { continue; }
    if (!isInFOV(myPos, myVel, otherPos, fov)) { continue; }

    let otherVel = velocities[i];
    let weight = 1.0 - (dist / perceptionRadius);
    
    // ALIGNMENT
    alignment += otherVel * weight;
    alignWeight += weight;

    // COHESION
    cohesion += otherPos * weight;
    cohesionWeight += weight;

    neighborCount++;

    // SEPARATION
    if (dist < separationRadius && dist > 0.0) {
      let invDistSq = 1.0 / distSq;
      separation += normalize(diff) * invDistSq;
      separationCount++;
    }
  }

  // Finalize alignment
  var alignForce = vec2f(0.0, 0.0);
  if (alignWeight > 0.0) {
    alignment /= alignWeight;
    alignment = setMag(alignment, maxSpeed);
    alignForce = limit(alignment - myVel, maxForce);
  }

  // Finalize cohesion
  var cohesionForce = vec2f(0.0, 0.0);
  if (cohesionWeight > 0.0) {
    cohesion /= cohesionWeight;
    var desired = cohesion - myPos;
    let densityFactor = max(0.3, 1.0 - f32(neighborCount) / 20.0);
    desired *= densityFactor;
    desired = setMag(desired, maxSpeed);
    cohesionForce = limit(desired - myVel, maxForce);
  }

  // Finalize separation
  var separationForce = vec2f(0.0, 0.0);
  if (separationCount > 0u) {
    separation /= f32(separationCount);
    if (dot(separation, separation) > 0.0001) {
      separation = setMag(separation, maxSpeed);
      separationForce = limit(separation - myVel, maxForce);
    }
  }

  // Combine with weights
  var totalForce = 
    alignForce * getAlignmentWeight() +
    cohesionForce * getCohesionWeight() +
    separationForce * getSeparationWeight();

  // Boundary avoidance
  let margin = getBoundaryMargin();
  let boundaryForceStrength = getBoundaryForce();
  var boundaryForce = vec2f(0.0, 0.0);
  
  if (myPos.x < margin) {
    boundaryForce.x = boundaryForceStrength * (margin - myPos.x) / margin;
  } else if (myPos.x > getWidth() - margin) {
    boundaryForce.x = -boundaryForceStrength * (myPos.x - (getWidth() - margin)) / margin;
  }
  if (myPos.y < margin) {
    boundaryForce.y = boundaryForceStrength * (margin - myPos.y) / margin;
  } else if (myPos.y > getHeight() - margin) {
    boundaryForce.y = -boundaryForceStrength * (myPos.y - (getHeight() - margin)) / margin;
  }
  totalForce += boundaryForce;

  // Predator avoidance
  let panicRadius = config[20];
  for (var p: u32 = 0u; p < 10u; p++) {
    let predActive = predators[p * 8u + 5u];
    if (predActive < 0.5) { continue; }
    
    let predPos = vec2f(predators[p * 8u], predators[p * 8u + 1u]);
    let toPred = myPos - predPos;
    let distToPred = length(toPred);
    
    if (distToPred < panicRadius && distToPred > 0.0) {
      let panicLevel = 1.0 - (distToPred / panicRadius);
      setPanicLevel(idx, max(getPanicLevel(idx), panicLevel));
      
      let fleeForce = normalize(toPred) * maxForce * (1.0 + panicLevel * 2.0);
      totalForce += fleeForce;
    }
  }

  // Apply panic boost and limit
  let panicLevel = getPanicLevel(idx);
  totalForce = limit(totalForce, maxForce * (1.0 + panicLevel));

  // Store result
  accelerations[idx] = totalForce;
  setLocalDensity(idx, f32(neighborCount));
}
```

---

## WGSL Physics Shader

```wgsl
@group(0) @binding(0) var<storage, read_write> positions: array<vec2f>;
@group(0) @binding(1) var<storage, read_write> velocities: array<vec2f>;
@group(0) @binding(2) var<storage, read> accelerations: array<vec2f>;
@group(0) @binding(3) var<storage, read_write> states: array<f32>;
@group(0) @binding(4) var<uniform> config: array<f32, 64>;

fn getBirdCount() -> u32 { return u32(config[0]); }
fn getDeltaTime() -> f32 { return config[3]; }
fn getMaxSpeed() -> f32 { return config[4]; }
fn getSimSpeed() -> f32 { return config[14]; }
fn getEnergyEnabled() -> bool { return config[15] > 0.5; }
fn getEnergyDecay() -> f32 { return config[32]; }
fn getMinEnergySpeed() -> f32 { return config[33]; }

fn getPanicLevel(idx: u32) -> f32 { return states[idx * 8u]; }
fn setPanicLevel(idx: u32, val: f32) { states[idx * 8u] = val; }
fn getEnergy(idx: u32) -> f32 { return states[idx * 8u + 1u]; }
fn setEnergy(idx: u32, val: f32) { states[idx * 8u + 1u] = val; }

fn limit(v: vec2f, maxMag: f32) -> vec2f {
  let magSq = dot(v, v);
  if (magSq > maxMag * maxMag) {
    return normalize(v) * maxMag;
  }
  return v;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3u) {
  let idx = global_id.x;
  let count = getBirdCount();
  
  if (idx >= count) { return; }

  let dt = getDeltaTime();
  let acc = accelerations[idx];
  var vel = velocities[idx];
  var pos = positions[idx];
  
  // Apply acceleration (scaled for 60 fps)
  vel += acc * dt * 60.0;

  // Calculate effective max speed
  var effectiveMaxSpeed = getMaxSpeed();
  
  // Energy affects speed
  if (getEnergyEnabled()) {
    let energy = getEnergy(idx);
    let minSpeed = getMinEnergySpeed();
    let energyMult = minSpeed + (1.0 - minSpeed) * energy;
    effectiveMaxSpeed *= energyMult;
  }

  // Panic boosts speed
  let panicLevel = getPanicLevel(idx);
  effectiveMaxSpeed *= (1.0 + panicLevel * 0.5);

  // Limit velocity
  vel = limit(vel, effectiveMaxSpeed);

  // Update position
  let simSpeed = getSimSpeed();
  pos += vel * dt * simSpeed;

  // Store results
  velocities[idx] = vel;
  positions[idx] = pos;

  // Decay panic
  if (panicLevel > 0.0) {
    var newPanic = panicLevel * 0.98;
    if (newPanic < 0.01) { newPanic = 0.0; }
    setPanicLevel(idx, newPanic);
  }

  // Decay energy
  if (getEnergyEnabled()) {
    var energy = getEnergy(idx);
    if (energy > 0.0) {
      let speed = length(vel);
      let speedFactor = 1.0 + (speed / getMaxSpeed()) * 0.5;
      energy -= getEnergyDecay() * dt * speedFactor;
      if (energy < 0.0) { energy = 0.0; }
      setEnergy(idx, energy);
    }
  }
}
```

---

## Data Download

```typescript
async downloadResults(birds: BirdArrays): Promise<void> {
  // Copy position data to staging buffer
  const commandEncoder = this.device.createCommandEncoder();
  commandEncoder.copyBufferToBuffer(
    this.positionBuffer, 0,
    this.stagingBuffer, 0,
    this.birdCount * 2 * 4
  );
  this.device.queue.submit([commandEncoder.finish()]);

  // Map and read
  await this.stagingBuffer.mapAsync(GPUMapMode.READ);
  const positionData = new Float32Array(this.stagingBuffer.getMappedRange().slice(0));
  this.stagingBuffer.unmap();

  // De-interleave back to SoA
  for (let i = 0; i < this.birdCount; i++) {
    birds.positionX[i] = positionData[i * 2];
    birds.positionY[i] = positionData[i * 2 + 1];
  }

  // Repeat for velocity and state buffers...
}
```

---

## @use-gpu/core Integration

The project uses `@use-gpu/core` for simplified WebGPU buffer management:

```typescript
import { 
  makeStorageBuffer,   // Creates GPUBuffer with STORAGE usage
  makeUniformBuffer,   // Creates GPUBuffer with UNIFORM usage
  uploadBuffer,        // Writes data to GPU buffer
  clearBuffer          // Zeros out buffer region
} from '@use-gpu/core';

// Storage buffer creation
this.positionBuffer = makeStorageBuffer(
  this.device, 
  new Float32Array(maxBirds * 2),
  GPUBufferUsage.COPY_SRC  // Additional flags
);

// Data upload
uploadBuffer(this.device, this.positionBuffer, positionData.buffer);

// Buffer clearing
clearBuffer(this.device, this.accelerationBuffer, 0, byteLength);
```

---

## Performance Characteristics

| Bird Count | CPU Time | GPU Time | Speedup |
|------------|----------|----------|---------|
| 1,000 | 15ms | 2ms | 7.5x |
| 2,000 | 60ms | 3ms | 20x |
| 5,000 | 350ms | 8ms | 44x |
| 10,000 | 1400ms | 18ms | 78x |

**Note**: GPU excels with larger flocks due to parallelization. For small flocks (<500), CPU may be faster due to GPU overhead.

---

## Limitations

1. **O(N²) on GPU**: Still checks all pairs, but parallelized
2. **Staging Buffer Overhead**: CPU readback requires copy + map operations
3. **State Machine Complexity**: Feeding/mating state machines run on CPU
4. **Browser Support**: WebGPU not yet universal (Chrome 113+, Firefox behind flag)
