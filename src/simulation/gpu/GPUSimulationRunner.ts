import type { Flux } from '@flux-gpu/core';
import type { ISimulationConfig, IEnvironmentConfig, IGPUCapabilities } from '../../types';
import { BirdArrays } from '../Bird';

// Version: 2.0.0 - Smooth steering-based boundary avoidance

// Workgroup size (must match shader)
const WORKGROUP_SIZE = 64;

/**
 * GPU Simulation Runner using @flux-gpu/core
 * Version: 2.0.0
 * Now integrates with shared Flux context for unified GPU operations.
 * Enhanced with:
 * - Smooth steering-based boundary avoidance with look-ahead anticipation
 * - Distance-weighted alignment, density-adaptive cohesion
 * - Inverse-square separation, and gradient noise for natural movement
 */
export class GPUSimulationRunner {
  private device: GPUDevice | null = null;
  private flockingPipeline: GPUComputePipeline | null = null;
  private physicsPipeline: GPUComputePipeline | null = null;
  private bindGroup: GPUBindGroup | null = null;

  // GPU Buffers
  private positionBuffer: GPUBuffer | null = null;
  private velocityBuffer: GPUBuffer | null = null;
  private accelerationBuffer: GPUBuffer | null = null;
  private stateBuffer: GPUBuffer | null = null;
  private configBuffer: GPUBuffer | null = null;

  // Staging buffers for readback
  private positionReadBuffer: GPUBuffer | null = null;
  private velocityReadBuffer: GPUBuffer | null = null;
  private stateReadBuffer: GPUBuffer | null = null;

  // State
  private maxBirds: number = 0;
  private currentBirdCount: number = 0;
  private worldWidth: number = 1920;
  private worldHeight: number = 1080;
  private time: number = 0;
  private _isReady: boolean = false;

  get isReady(): boolean {
    return this._isReady;
  }

  /**
   * Check if WebGPU is available and get capabilities.
   */
  static async checkCapabilities(): Promise<IGPUCapabilities> {
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

      // Try to get adapter info if available
      let adapterName = 'WebGPU Adapter';
      try {
        const info = await (adapter as any).requestAdapterInfo?.();
        if (info) {
          adapterName = info.description || info.vendor || 'Unknown GPU';
        }
      } catch {
        // Fallback if requestAdapterInfo is not available
      }

      return {
        available: true,
        adapter: adapterName
      };
    } catch (error) {
      return {
        available: false,
        adapter: null,
        reason: `WebGPU initialization error: ${error}`
      };
    }
  }

  /**
   * Initialize with Flux shared context (preferred).
   * This allows sharing the GPU device between compute and render.
   */
  async initializeWithFlux(flux: Flux, maxBirds: number, worldWidth: number, worldHeight: number): Promise<boolean> {
    console.log('GPUSimulationRunner v1.3.0 - Initializing with Flux context');
    this.maxBirds = maxBirds;
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;

    try {
      // Use Flux's device directly
      this.device = flux.device;

      if (!this.device) {
        console.warn('Flux device not available');
        return false;
      }

      // Create buffers
      this.createBuffers();

      // Create compute pipelines
      await this.createPipelines();

      // Create bind group
      this.createBindGroup();

      this._isReady = true;
      console.log(`GPU Simulation initialized for ${maxBirds} birds (using Flux context)`);
      return true;
    } catch (error) {
      console.error('GPU initialization failed:', error);
      return false;
    }
  }

  /**
   * Initialize WebGPU device and create pipelines (standalone mode).
   * Use initializeWithFlux() instead when rendering with Flux.
   */
  async initialize(maxBirds: number, worldWidth: number, worldHeight: number): Promise<boolean> {
    console.log('GPUSimulationRunner v1.3.0 - Initializing standalone');
    this.maxBirds = maxBirds;
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;

    try {
      // Request adapter
      const adapter = await navigator.gpu?.requestAdapter();

      if (!adapter) {
        console.warn('WebGPU adapter not available');
        return false;
      }

      // Request device
      this.device = await adapter.requestDevice({
        requiredFeatures: [],
        requiredLimits: {
          maxStorageBufferBindingSize: 256 * 1024 * 1024, // 256MB
          maxComputeWorkgroupsPerDimension: 65535
        }
      });

      if (!this.device) {
        console.warn('Failed to get WebGPU device');
        return false;
      }

      // Create buffers
      this.createBuffers();

      // Create compute pipelines
      await this.createPipelines();

      // Create bind group
      this.createBindGroup();

      this._isReady = true;
      console.log(`GPU Simulation initialized for ${maxBirds} birds`);
      return true;
    } catch (error) {
      console.error('GPU initialization failed:', error);
      return false;
    }
  }

  /**
   * Create all GPU buffers.
   */
  private createBuffers(): void {
    if (!this.device) return;

    const posSize = this.maxBirds * 2 * 4; // x,y per bird, 4 bytes per float
    const velSize = this.maxBirds * 2 * 4;
    const accelSize = this.maxBirds * 2 * 4;
    const stateSize = this.maxBirds * 4 * 4; // panicLevel, localDensity, energy, heading

    // Position buffer (read/write in shader)
    this.positionBuffer = this.device.createBuffer({
      size: posSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      label: 'position'
    });

    // Velocity buffer (read/write in shader)
    this.velocityBuffer = this.device.createBuffer({
      size: velSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      label: 'velocity'
    });

    // Acceleration buffer (output from flocking, input to physics)
    this.accelerationBuffer = this.device.createBuffer({
      size: accelSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      label: 'acceleration'
    });

    // State buffer (panic, density, energy, heading)
    this.stateBuffer = this.device.createBuffer({
      size: stateSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      label: 'state'
    });

    // Config uniform buffer
    this.configBuffer = this.device.createBuffer({
      // NOTE: Must match what updateConfig() writes.
      // We write 24 floats (96 bytes) and WGSL uniforms are 16-byte aligned.
      size: 96, // 24 floats * 4 bytes
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'config'
    });

    // Read-back staging buffers
    this.positionReadBuffer = this.device.createBuffer({
      size: posSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      label: 'position-read'
    });

    this.velocityReadBuffer = this.device.createBuffer({
      size: velSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      label: 'velocity-read'
    });

    this.stateReadBuffer = this.device.createBuffer({
      size: stateSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      label: 'state-read'
    });
  }

  /**
   * Create compute pipelines.
   */
  private async createPipelines(): Promise<void> {
    if (!this.device) return;

    // Flocking shader (calculates forces)
    const flockingShader = this.device.createShaderModule({
      label: 'flocking',
      code: this.getFlockingShaderCode()
    });

    // Physics shader (integrates motion)
    const physicsShader = this.device.createShaderModule({
      label: 'physics',
      code: this.getPhysicsShaderCode()
    });

    // Bind group layout
    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'storage' } // position
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'storage' } // velocity
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'storage' } // acceleration
        },
        {
          binding: 3,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'storage' } // state
        },
        {
          binding: 4,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'uniform' } // config
        }
      ]
    });

    const pipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout]
    });

    // Flocking pipeline
    this.flockingPipeline = this.device.createComputePipeline({
      layout: pipelineLayout,
      compute: {
        module: flockingShader,
        entryPoint: 'main'
      }
    });

    // Physics pipeline
    this.physicsPipeline = this.device.createComputePipeline({
      layout: pipelineLayout,
      compute: {
        module: physicsShader,
        entryPoint: 'main'
      }
    });
  }

  /**
   * Create bind group.
   */
  private createBindGroup(): void {
    if (!this.device || !this.flockingPipeline) return;

    this.bindGroup = this.device.createBindGroup({
      layout: this.flockingPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.positionBuffer! } },
        { binding: 1, resource: { buffer: this.velocityBuffer! } },
        { binding: 2, resource: { buffer: this.accelerationBuffer! } },
        { binding: 3, resource: { buffer: this.stateBuffer! } },
        { binding: 4, resource: { buffer: this.configBuffer! } }
      ]
    });
  }

  /**
   * Get position buffer for direct GPU rendering.
   */
  getPositionBuffer(): GPUBuffer | null {
    return this.positionBuffer;
  }

  /**
   * Get velocity buffer for direct GPU rendering.
   */
  getVelocityBuffer(): GPUBuffer | null {
    return this.velocityBuffer;
  }

  /**
   * Get state buffer for direct GPU rendering.
   */
  getStateBuffer(): GPUBuffer | null {
    return this.stateBuffer;
  }

  /**
   * Get current bird count.
   */
  getBirdCount(): number {
    return this.currentBirdCount;
  }

  /**
   * Upload bird data to GPU.
   */
  uploadData(birdArrays: BirdArrays): void {
    if (!this.device || !this._isReady) return;

    this.currentBirdCount = birdArrays.count;

    // Interleave position data (x,y pairs)
    const posData = new Float32Array(birdArrays.count * 2);
    for (let i = 0; i < birdArrays.count; i++) {
      posData[i * 2] = birdArrays.positionX[i];
      posData[i * 2 + 1] = birdArrays.positionY[i];
    }
    this.device.queue.writeBuffer(this.positionBuffer!, 0, posData);

    // Interleave velocity data
    const velData = new Float32Array(birdArrays.count * 2);
    for (let i = 0; i < birdArrays.count; i++) {
      velData[i * 2] = birdArrays.velocityX[i];
      velData[i * 2 + 1] = birdArrays.velocityY[i];
    }
    this.device.queue.writeBuffer(this.velocityBuffer!, 0, velData);

    // State data (panic, density, energy, heading)
    const stateData = new Float32Array(birdArrays.count * 4);
    for (let i = 0; i < birdArrays.count; i++) {
      stateData[i * 4] = birdArrays.panicLevel[i];
      stateData[i * 4 + 1] = birdArrays.localDensity[i];
      stateData[i * 4 + 2] = birdArrays.energy[i];
      stateData[i * 4 + 3] = birdArrays.heading[i];
    }
    this.device.queue.writeBuffer(this.stateBuffer!, 0, stateData);

    // Clear acceleration
    const accelData = new Float32Array(birdArrays.count * 2);
    this.device.queue.writeBuffer(this.accelerationBuffer!, 0, accelData);
  }

  /**
   * Download bird data from GPU.
   */
  async downloadData(birdArrays: BirdArrays): Promise<void> {
    if (!this.device || !this._isReady) return;

    const count = this.currentBirdCount;

    // Copy buffers to staging
    const commandEncoder = this.device.createCommandEncoder();
    commandEncoder.copyBufferToBuffer(
      this.positionBuffer!,
      0,
      this.positionReadBuffer!,
      0,
      count * 2 * 4
    );
    commandEncoder.copyBufferToBuffer(
      this.velocityBuffer!,
      0,
      this.velocityReadBuffer!,
      0,
      count * 2 * 4
    );
    commandEncoder.copyBufferToBuffer(
      this.stateBuffer!,
      0,
      this.stateReadBuffer!,
      0,
      count * 4 * 4
    );
    this.device.queue.submit([commandEncoder.finish()]);

    // Map and read position
    await this.positionReadBuffer!.mapAsync(GPUMapMode.READ);
    const posData = new Float32Array(this.positionReadBuffer!.getMappedRange().slice(0));
    this.positionReadBuffer!.unmap();

    // Map and read velocity
    await this.velocityReadBuffer!.mapAsync(GPUMapMode.READ);
    const velData = new Float32Array(this.velocityReadBuffer!.getMappedRange().slice(0));
    this.velocityReadBuffer!.unmap();

    // Map and read state
    await this.stateReadBuffer!.mapAsync(GPUMapMode.READ);
    const stateData = new Float32Array(this.stateReadBuffer!.getMappedRange().slice(0));
    this.stateReadBuffer!.unmap();

    // De-interleave back to SoA
    for (let i = 0; i < count; i++) {
      birdArrays.positionX[i] = posData[i * 2];
      birdArrays.positionY[i] = posData[i * 2 + 1];
      birdArrays.velocityX[i] = velData[i * 2];
      birdArrays.velocityY[i] = velData[i * 2 + 1];
      birdArrays.panicLevel[i] = stateData[i * 4];
      birdArrays.localDensity[i] = stateData[i * 4 + 1];
      birdArrays.energy[i] = stateData[i * 4 + 2];
      birdArrays.heading[i] = stateData[i * 4 + 3];
    }
  }

  /**
   * Update config uniform buffer.
   */
  updateConfig(
    simConfig: ISimulationConfig,
    envConfig: IEnvironmentConfig,
    deltaTime: number
  ): void {
    if (!this.device || !this._isReady) return;

    this.time += deltaTime;

    // Calculate wind vector
    const windAngle = (envConfig.windDirection * Math.PI) / 180;
    const windX = envConfig.windEnabled ? Math.cos(windAngle) * envConfig.windSpeed : 0;
    const windY = envConfig.windEnabled ? Math.sin(windAngle) * envConfig.windSpeed : 0;

    // FOV in cosine form for efficient comparison in shader
    const fovCos = Math.cos((simConfig.fieldOfView * Math.PI) / 360);

    const configData = new Float32Array([
      this.currentBirdCount, // 0
      simConfig.maxSpeed, // 1
      simConfig.maxForce, // 2
      simConfig.perceptionRadius, // 3
      simConfig.separationRadius, // 4
      simConfig.alignmentWeight, // 5
      simConfig.cohesionWeight, // 6
      simConfig.separationWeight, // 7
      fovCos, // 8
      simConfig.boundaryMargin, // 9
      simConfig.boundaryForce, // 10
      simConfig.noiseStrength, // 11
      simConfig.wanderStrength, // 12
      this.worldWidth, // 13
      this.worldHeight, // 14
      deltaTime, // 15
      this.time, // 16
      windX, // 17
      windY, // 18
      simConfig.simulationSpeed, // 19
      simConfig.boundaryCurvePower ?? 1.5, // 20
      simConfig.boundaryLookAhead ?? 0.8, // 21
      simConfig.wallDampingFactor ?? 0.8, // 22
      simConfig.minEscapeSpeed ?? 0.3  // 23
    ]);

    this.device.queue.writeBuffer(this.configBuffer!, 0, configData);
  }

  /**
   * Run compute shaders for one simulation step.
   */
  compute(): void {
    if (!this.device || !this._isReady || !this.flockingPipeline || !this.physicsPipeline) return;

    const workgroupCount = Math.ceil(this.currentBirdCount / WORKGROUP_SIZE);

    const commandEncoder = this.device.createCommandEncoder();

    // Pass 1: Flocking (calculate forces)
    const flockingPass = commandEncoder.beginComputePass();
    flockingPass.setPipeline(this.flockingPipeline);
    flockingPass.setBindGroup(0, this.bindGroup!);
    flockingPass.dispatchWorkgroups(workgroupCount);
    flockingPass.end();

    // Pass 2: Physics (integrate motion)
    const physicsPass = commandEncoder.beginComputePass();
    physicsPass.setPipeline(this.physicsPipeline);
    physicsPass.setBindGroup(0, this.bindGroup!);
    physicsPass.dispatchWorkgroups(workgroupCount);
    physicsPass.end();

    this.device.queue.submit([commandEncoder.finish()]);
  }

  /**
   * Resize world dimensions.
   */
  resize(width: number, height: number): void {
    this.worldWidth = width;
    this.worldHeight = height;
  }

  /**
   * Clean up GPU resources.
   */
  destroy(): void {
    // Only destroy buffers if not using shared Flux context
    // When using Flux, the main app controls resource lifetime
    this.positionBuffer?.destroy();
    this.velocityBuffer?.destroy();
    this.accelerationBuffer?.destroy();
    this.stateBuffer?.destroy();
    this.configBuffer?.destroy();
    this.positionReadBuffer?.destroy();
    this.velocityReadBuffer?.destroy();
    this.stateReadBuffer?.destroy();

    this.device = null;
    this._isReady = false;
  }

  // ============================================================================
  // Shader Code
  // ============================================================================

  private getFlockingShaderCode(): string {
    return `
struct Config {
  birdCount: f32,
  maxSpeed: f32,
  maxForce: f32,
  perceptionRadius: f32,
  separationRadius: f32,
  alignmentWeight: f32,
  cohesionWeight: f32,
  separationWeight: f32,
  fieldOfViewCos: f32,
  boundaryMargin: f32,
  boundaryForce: f32,
  noiseStrength: f32,
  wanderStrength: f32,
  worldWidth: f32,
  worldHeight: f32,
  deltaTime: f32,
  time: f32,
  windX: f32,
  windY: f32,
  simulationSpeed: f32,
  boundaryCurvePower: f32,
  boundaryLookAhead: f32,
  wallDampingFactor: f32,
  minEscapeSpeed: f32,
}

@group(0) @binding(0) var<storage, read_write> positions: array<vec2<f32>>;
@group(0) @binding(1) var<storage, read_write> velocities: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read_write> accelerations: array<vec2<f32>>;
@group(0) @binding(3) var<storage, read_write> states: array<vec4<f32>>;
@group(0) @binding(4) var<uniform> config: Config;

// Calculate wall proximity factor for damping flocking forces near walls
fn calculateWallProximity(pos: vec2<f32>, margin: f32, worldWidth: f32, worldHeight: f32) -> f32 {
  let distToLeft = pos.x;
  let distToRight = worldWidth - pos.x;
  let distToTop = pos.y;
  let distToBottom = worldHeight - pos.y;
  let minDist = min(min(distToLeft, distToRight), min(distToTop, distToBottom));
  
  if (minDist >= margin) {
    return 1.0;
  }
  return max(0.0, minDist / margin);
}

// Simple hash for pseudo-random
fn hash(n: f32) -> f32 {
  return fract(sin(n) * 43758.5453);
}

// Perlin-style gradient noise for smoother randomness
fn gradientNoise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);  // smoothstep
  
  let a = hash(i.x + i.y * 57.0);
  let b = hash(i.x + 1.0 + i.y * 57.0);
  let c = hash(i.x + (i.y + 1.0) * 57.0);
  let d = hash(i.x + 1.0 + (i.y + 1.0) * 57.0);
  
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 2.0 - 1.0;
}

// Check if point is in field of view
fn inFOV(dir: vec2<f32>, toOther: vec2<f32>, fovCos: f32) -> bool {
  let dirLen = length(dir);
  let toLen = length(toOther);
  if (dirLen < 0.001 || toLen < 0.001) { return true; }
  let cosAngle = dot(dir / dirLen, toOther / toLen);
  return cosAngle > fovCos;
}

// Smoothstep function for smooth force transitions
fn smoothstepCustom(x: f32) -> f32 {
  let t = clamp(x, 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

// Calculate steering-based boundary force with look-ahead anticipation
// Version: 2.0.0 - Smooth curves and velocity awareness
fn calculateBoundaryForce(
  pos: vec2<f32>,
  vel: vec2<f32>,
  margin: f32,
  force: f32,
  maxSpeed: f32,
  maxForce: f32,
  worldWidth: f32,
  worldHeight: f32,
  power: f32,
  lookAheadMult: f32
) -> vec2<f32> {
  // Calculate current speed for look-ahead
  let speed = length(vel);
  
  // Look-ahead time scales with speed (faster = look further ahead)
  let lookAheadTime = select(0.0, lookAheadMult * (speed / maxSpeed), speed > 0.1);
  
  // Calculate future position based on current velocity
  let futurePos = pos + vel * lookAheadTime;
  
  // Calculate distances to boundaries (use minimum of current and future)
  let distLeft = min(pos.x, futurePos.x);
  let distRight = min(worldWidth - pos.x, worldWidth - futurePos.x);
  let distTop = min(pos.y, futurePos.y);
  let distBottom = min(worldHeight - pos.y, worldHeight - futurePos.y);
  
  // Accumulate boundary force
  var boundary = vec2<f32>(0.0);
  
  // Left edge - smooth force curve with smoothstep
  if (distLeft < margin && distLeft > 0.0) {
    let t = 1.0 - distLeft / margin;
    let smoothT = smoothstepCustom(t);
    boundary.x += force * pow(smoothT, power);
  } else if (distLeft <= 0.0) {
    boundary.x += force;
  }
  
  // Right edge
  if (distRight < margin && distRight > 0.0) {
    let t = 1.0 - distRight / margin;
    let smoothT = smoothstepCustom(t);
    boundary.x -= force * pow(smoothT, power);
  } else if (distRight <= 0.0) {
    boundary.x -= force;
  }
  
  // Top edge
  if (distTop < margin && distTop > 0.0) {
    let t = 1.0 - distTop / margin;
    let smoothT = smoothstepCustom(t);
    boundary.y += force * pow(smoothT, power);
  } else if (distTop <= 0.0) {
    boundary.y += force;
  }
  
  // Bottom edge
  if (distBottom < margin && distBottom > 0.0) {
    let t = 1.0 - distBottom / margin;
    let smoothT = smoothstepCustom(t);
    boundary.y -= force * pow(smoothT, power);
  } else if (distBottom <= 0.0) {
    boundary.y -= force;
  }
  
  // Apply as steering force for smooth direction change
  let boundaryMag = length(boundary);
  
  if (boundaryMag > 0.001) {
    // Calculate desired velocity direction (away from boundary)
    var desired = (boundary / boundaryMag) * maxSpeed;
    
    // Scale by force ratio for gradual turn
    let forceRatio = min(1.0, boundaryMag / force);
    desired = desired * forceRatio;
    
    // Steering = desired - current (Reynolds steering formula)
    var steer = desired - vel * forceRatio;
    
    // Limit steering force
    let steerMag = length(steer);
    if (steerMag > maxForce) {
      steer = (steer / steerMag) * maxForce;
    }
    
    return steer;
  }
  
  return vec2<f32>(0.0);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  let count = u32(config.birdCount);
  
  if (idx >= count) { return; }

  let pos = positions[idx];
  let vel = velocities[idx];
  let state = states[idx];

  // Accumulate forces with distance weighting
  var separation = vec2<f32>(0.0);
  var alignment = vec2<f32>(0.0);
  var cohesion = vec2<f32>(0.0);
  var separationCount = 0u;
  var neighborCount = 0u;
  var alignWeight = 0.0;
  var cohWeight = 0.0;

  let percRad = config.perceptionRadius;
  let percRadSq = percRad * percRad;
  let sepRadSq = config.separationRadius * config.separationRadius;

  // Check all other birds
  for (var i = 0u; i < count; i++) {
    if (i == idx) { continue; }

    let otherPos = positions[i];
    let otherVel = velocities[i];
    let diff = otherPos - pos;
    let distSq = dot(diff, diff);

    // Perception check
    if (distSq < percRadSq && distSq > 0.0001) {
      // FOV check
      if (inFOV(vel, diff, config.fieldOfViewCos)) {
        let dist = sqrt(distSq);
        neighborCount += 1u;

        // Distance weight: closer = stronger (1 at center, 0 at edge)
        let weight = 1.0 - (dist / percRad);

        // Alignment - distance-weighted velocity averaging
        alignment += otherVel * weight;
        alignWeight += weight;

        // Cohesion - distance-weighted position averaging
        cohesion += otherPos * weight;
        cohWeight += weight;

        // Separation - inverse-square weighting for strong close-range repulsion
        if (distSq < sepRadSq) {
          let away = pos - otherPos;
          let invDistSq = 1.0 / distSq;
          separation += (away / dist) * invDistSq;
          separationCount += 1u;
        }
      }
    }
  }

  var accel = vec2<f32>(0.0);

  // Apply flocking rules with enhanced weighting

  // Alignment: distance-weighted velocity steering
  if (alignWeight > 0.0) {
    alignment = alignment / alignWeight;
    let alignMag = length(alignment);
    if (alignMag > 0.0) {
      let alignTarget = (alignment / alignMag) * config.maxSpeed - vel;
      let steerMag = length(alignTarget);
      if (steerMag > 0.0) {
        accel += (alignTarget / steerMag) * min(steerMag, config.maxForce) * config.alignmentWeight;
      }
    }
  }

  // Cohesion: distance-weighted with density adaptation
  if (cohWeight > 0.0) {
    // Calculate weighted center of mass
    cohesion = cohesion / cohWeight;
    var cohTarget = cohesion - pos;
    
    // Density adaptation: reduce cohesion when crowded (at 20+ neighbors, drops to 30%)
    let densityFactor = max(0.3, 1.0 - f32(neighborCount) / 20.0);
    cohTarget = cohTarget * densityFactor;
    
    let cohMag = length(cohTarget);
    if (cohMag > 0.0) {
      let desired = (cohTarget / cohMag) * config.maxSpeed;
      let steer = desired - vel;
      let steerMag = length(steer);
      if (steerMag > 0.0) {
        accel += (steer / steerMag) * min(steerMag, config.maxForce) * config.cohesionWeight;
      }
    }
  }

  // Separation: inverse-square weighted
  if (separationCount > 0u) {
    separation = separation / f32(separationCount);
    let sepMag = length(separation);
    if (sepMag > 0.0) {
      let desired = (separation / sepMag) * config.maxSpeed;
      let steer = desired - vel;
      let steerMag = length(steer);
      if (steerMag > 0.0) {
        accel += (steer / steerMag) * min(steerMag, config.maxForce) * config.separationWeight;
      }
    }
  }

  // Wall proximity damping: reduce flocking forces when near walls
  // This prevents neighbors from pulling birds into walls
  let wallProximity = calculateWallProximity(pos, config.boundaryMargin, config.worldWidth, config.worldHeight);
  let dampedProximity = wallProximity * config.wallDampingFactor + (1.0 - config.wallDampingFactor);
  accel = accel * dampedProximity;
  
  // Anti-cluster jitter: add random perturbation when very close to wall
  let minDistToWall = min(min(pos.x, config.worldWidth - pos.x), min(pos.y, config.worldHeight - pos.y));
  if (minDistToWall < config.boundaryMargin * 0.3) {
    let jitterStrength = (1.0 - minDistToWall / (config.boundaryMargin * 0.3)) * 0.5;
    let jitterX = (hash(f32(idx) + config.time * 100.0) - 0.5) * jitterStrength;
    let jitterY = (hash(f32(idx) + config.time * 100.0 + 1000.0) - 0.5) * jitterStrength;
    accel += vec2<f32>(jitterX, jitterY);
  }

  // Boundary avoidance - smooth steering-based with look-ahead
  let boundarySteer = calculateBoundaryForce(
    pos,
    vel,
    config.boundaryMargin,
    config.boundaryForce,
    config.maxSpeed,
    config.maxForce,
    config.worldWidth,
    config.worldHeight,
    config.boundaryCurvePower,
    config.boundaryLookAhead
  );
  accel += boundarySteer;

  // Wind force with position-based turbulence
  let windBase = vec2<f32>(config.windX, config.windY);
  let turbScale = 0.003;
  let turbX = gradientNoise(vec2<f32>(pos.x * turbScale + config.time * 0.5, pos.y * turbScale)) * 0.3;
  let turbY = gradientNoise(vec2<f32>(pos.x * turbScale + 100.0, pos.y * turbScale + config.time * 0.5)) * 0.3;
  accel += windBase + vec2<f32>(turbX, turbY) * length(windBase);

  // Smooth wander using gradient noise
  let noiseX = pos.x * 0.01 + config.time * 0.5;
  let noiseY = pos.y * 0.01 + f32(idx) * 0.1;
  let wanderNoise = gradientNoise(vec2<f32>(noiseX, noiseY));
  let heading = atan2(vel.y, vel.x);
  let wanderAngle = heading + wanderNoise * config.noiseStrength * 3.14159;
  accel += vec2<f32>(cos(wanderAngle), sin(wanderAngle)) * config.wanderStrength;

  // Store acceleration
  accelerations[idx] = accel;

  // Update local density in state (normalized)
  let normalizedDensity = f32(neighborCount) / max(20.0, f32(neighborCount));
  states[idx] = vec4<f32>(state.x, normalizedDensity, state.z, state.w);
}
`;
  }

  private getPhysicsShaderCode(): string {
    return `
struct Config {
  birdCount: f32,
  maxSpeed: f32,
  maxForce: f32,
  perceptionRadius: f32,
  separationRadius: f32,
  alignmentWeight: f32,
  cohesionWeight: f32,
  separationWeight: f32,
  fieldOfViewCos: f32,
  boundaryMargin: f32,
  boundaryForce: f32,
  noiseStrength: f32,
  wanderStrength: f32,
  worldWidth: f32,
  worldHeight: f32,
  deltaTime: f32,
  time: f32,
  windX: f32,
  windY: f32,
  simulationSpeed: f32,
  boundaryCurvePower: f32,
  boundaryLookAhead: f32,
  wallDampingFactor: f32,
  minEscapeSpeed: f32,
}

@group(0) @binding(0) var<storage, read_write> positions: array<vec2<f32>>;
@group(0) @binding(1) var<storage, read_write> velocities: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read_write> accelerations: array<vec2<f32>>;
@group(0) @binding(3) var<storage, read_write> states: array<vec4<f32>>;
@group(0) @binding(4) var<uniform> config: Config;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  let count = u32(config.birdCount);
  
  if (idx >= count) { return; }

  var pos = positions[idx];
  var vel = velocities[idx];
  let accel = accelerations[idx];
  var state = states[idx];

  // Apply acceleration
  vel += accel * config.deltaTime * 60.0;

  // Panic boost (state.x = panicLevel)
  let panicBoost = 1.0 + state.x * 0.5;
  let effectiveMaxSpeed = config.maxSpeed * panicBoost;

  // Limit velocity
  let speed = length(vel);
  if (speed > effectiveMaxSpeed) {
    vel = vel / speed * effectiveMaxSpeed;
  }

  // Update position (with simulation speed multiplier)
  pos += vel * config.deltaTime * config.simulationSpeed;

  // Boundary handling (prevents border "sticking"):
  // - Clamp position
  // - Reflect velocity component when hitting a wall
  let pad = 10.0;
  let minX = pad;
  let maxX = config.worldWidth - pad;
  let minY = pad;
  let maxY = config.worldHeight - pad;
  let restitution = 0.8;
  let wallFriction = 0.98;

  // Left/right walls
  if (pos.x <= minX) {
    pos.x = minX;
    vel.x = abs(vel.x) * restitution;
    vel.y = vel.y * wallFriction;
  } else if (pos.x >= maxX) {
    pos.x = maxX;
    vel.x = -abs(vel.x) * restitution;
    vel.y = vel.y * wallFriction;
  }

  // Top/bottom walls
  if (pos.y <= minY) {
    pos.y = minY;
    vel.y = abs(vel.y) * restitution;
    vel.x = vel.x * wallFriction;
  } else if (pos.y >= maxY) {
    pos.y = maxY;
    vel.y = -abs(vel.y) * restitution;
    vel.x = vel.x * wallFriction;
  }

  // Minimum escape velocity: ensure birds have enough speed to escape walls
  let minEscapeVel = config.minEscapeSpeed * config.maxSpeed;
  let currentSpeed = length(vel);
  if (currentSpeed > 0.01 && currentSpeed < minEscapeVel) {
    vel = normalize(vel) * minEscapeVel;
  }

  // Update heading
  let newSpeed = length(vel);
  if (newSpeed > 0.1) {
    state.w = atan2(vel.y, vel.x);
  }

  // Decay panic
  state.x = state.x * 0.98;
  if (state.x < 0.01) { state.x = 0.0; }

  // Write back
  positions[idx] = pos;
  velocities[idx] = vel;
  states[idx] = state;
}
`;
  }
}
