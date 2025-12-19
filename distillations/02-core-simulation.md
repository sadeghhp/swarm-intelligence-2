# Core Simulation Engine

## Bird Entity

### Bird Class (`src/simulation/Bird.ts`)

The `Bird` class represents a single agent in the swarm with physics state and behavioral state.

#### Properties

```typescript
class Bird {
  // === IDENTITY ===
  readonly id: number;                    // Unique identifier
  speciesId: string = 'default';          // For multi-species ecosystem
  gender: Gender;                         // 'male' | 'female' (50/50 random)

  // === PHYSICS STATE ===
  position: Vector2;                      // Current location in 2D space
  velocity: Vector2;                      // Movement direction and speed
  acceleration: Vector2;                  // Forces accumulated this frame
  
  // === BEHAVIORAL STATE ===
  panicLevel: number = 0;                 // 0-1, affected by predators
  localDensity: number = 0;               // Number of nearby neighbors
  energy: number = 1.0;                   // 0-1, affects speed
  
  // === FEEDING STATE ===
  feedingState: FeedingState = 'none';    // State machine: none|approaching|gathering|feeding
  targetFoodId: number = -1;              // ID of targeted food source
  feedingTimer: number = 0;               // Duration at current feeding stage
  
  // === MATING STATE ===
  matingState: MatingState = 'none';      // State machine: none|seeking|approaching|courting|mating|fighting|cooldown
  targetMateId: number = -1;              // ID of target mate
  matingTimer: number = 0;                // Duration in current mating stage
  matingCooldown: number = 0;             // Time before can seek again
  aggressionLevel: number;                // 0-1, males only (for fighting)
  
  // === CACHED VALUES ===
  private _heading: number = 0;           // Direction facing (radians)
}
```

#### Constructor

```typescript
constructor(id: number, x: number, y: number) {
  this.id = id;
  this.position = new Vector2(x, y);
  this.velocity = Vector2.random().mult(5);  // Random initial direction
  this.acceleration = new Vector2();
  
  // 50/50 gender assignment
  this.gender = Math.random() < 0.5 ? 'male' : 'female';
  
  // Males have aggression for fighting
  this.aggressionLevel = this.gender === 'male' ? 0.5 + Math.random() * 0.5 : 0;
}
```

#### Physics Update Method

```typescript
update(
  deltaTime: number,
  config: ISimulationConfig,
  energyEnabled: boolean = false,
  energyDecayRate: number = 0.01,
  minEnergySpeed: number = 0.3
): void {
  // 1. Apply acceleration to velocity (scaled by 60 for frame-rate independence)
  const accelMult = deltaTime * 60;
  this.velocity.x += this.acceleration.x * accelMult;
  this.velocity.y += this.acceleration.y * accelMult;
  
  // 2. Calculate effective max speed
  let effectiveMaxSpeed = config.maxSpeed;
  
  // Energy affects speed: low energy = slower movement
  if (energyEnabled) {
    const energyMultiplier = minEnergySpeed + (1 - minEnergySpeed) * this.energy;
    effectiveMaxSpeed *= energyMultiplier;
  }
  
  // Panic boosts speed by up to 50%
  effectiveMaxSpeed *= (1 + this.panicLevel * 0.5);
  
  // 3. Limit velocity magnitude
  this.velocity.limit(effectiveMaxSpeed);
  
  // 4. Apply velocity to position
  const velMult = deltaTime * config.simulationSpeed;
  this.position.x += this.velocity.x * velMult;
  this.position.y += this.velocity.y * velMult;
  
  // 5. Cache heading for rendering (avoid if velocity near zero)
  const velMagSq = this.velocity.x * this.velocity.x + this.velocity.y * this.velocity.y;
  if (velMagSq > 0.01) {
    this._heading = Math.atan2(this.velocity.y, this.velocity.x);
  }
  
  // 6. Clear acceleration for next frame
  this.acceleration.x = 0;
  this.acceleration.y = 0;
  
  // 7. Decay panic level (exponential decay)
  if (this.panicLevel > 0) {
    this.panicLevel *= 0.98;
    if (this.panicLevel < 0.01) this.panicLevel = 0;
  }
  
  // 8. Decay energy based on speed
  if (energyEnabled && this.energy > 0) {
    const speedFactor = 1 + (this.speed / config.maxSpeed) * 0.5;
    this.energy -= energyDecayRate * deltaTime * speedFactor;
    if (this.energy < 0) this.energy = 0;
  }
  
  // 9. Decay mating cooldown
  if (this.matingCooldown > 0) {
    this.matingCooldown -= deltaTime;
    if (this.matingCooldown < 0) this.matingCooldown = 0;
  }
}
```

#### Force Application

```typescript
applyForce(force: Vector2): void {
  this.acceleration.x += force.x;
  this.acceleration.y += force.y;
}
```

#### Boundary Avoidance

```typescript
applyBoundaryForce(width: number, height: number, margin: number, force: number): void {
  // Pre-allocated vector to avoid GC
  tempBoundary.x = 0;
  tempBoundary.y = 0;
  
  const x = this.position.x;
  const y = this.position.y;
  const rightEdge = width - margin;
  const bottomEdge = height - margin;
  
  // Soft force field at edges - strength proportional to penetration
  if (x < margin) {
    tempBoundary.x = force * (margin - x) / margin;
  } else if (x > rightEdge) {
    tempBoundary.x = -force * (x - rightEdge) / margin;
  }
  
  if (y < margin) {
    tempBoundary.y = force * (margin - y) / margin;
  } else if (y > bottomEdge) {
    tempBoundary.y = -force * (y - bottomEdge) / margin;
  }
  
  if (tempBoundary.x !== 0 || tempBoundary.y !== 0) {
    this.acceleration.x += tempBoundary.x;
    this.acceleration.y += tempBoundary.y;
  }
}
```

#### Field of View Check

```typescript
isInFieldOfView(point: Vector2, fovDegrees: number): boolean {
  // If velocity is near zero, can see everything
  const velMagSq = this.velocity.x * this.velocity.x + this.velocity.y * this.velocity.y;
  if (velMagSq < 0.01) return true;
  
  // Calculate angle to point
  const dx = point.x - this.position.x;
  const dy = point.y - this.position.y;
  const angleToPoint = Math.atan2(dy, dx);
  
  // Calculate angular difference
  let diff = angleToPoint - this._heading;
  
  // Normalize to [-PI, PI]
  if (diff > Math.PI) diff -= 6.283185307179586;
  else if (diff < -Math.PI) diff += 6.283185307179586;
  
  // Check against half FOV (convert degrees to radians)
  const halfFov = fovDegrees * 0.008726646259971648; // PI/180/2
  return diff > -halfFov && diff < halfFov;
}
```

---

## BirdArrays (Structure of Arrays)

For GPU computation and large flocks, birds are stored in Structure-of-Arrays format:

```typescript
class BirdArrays {
  count: number;
  readonly maxCount: number;
  
  // === PHYSICS (Float32) ===
  positionX: Float32Array;
  positionY: Float32Array;
  velocityX: Float32Array;
  velocityY: Float32Array;
  accelerationX: Float32Array;
  accelerationY: Float32Array;
  heading: Float32Array;
  
  // === STATE (Float32) ===
  panicLevel: Float32Array;
  localDensity: Float32Array;
  energy: Float32Array;
  aggressionLevel: Float32Array;
  
  // === TIMERS (Float32) ===
  feedingTimer: Float32Array;
  matingTimer: Float32Array;
  matingCooldown: Float32Array;
  
  // === IDENTITY/ENUMS (Int32) ===
  id: Int32Array;
  speciesId: Int32Array;
  gender: Int32Array;           // 0=female, 1=male
  feedingState: Int32Array;     // 0=none, 1=approaching, 2=gathering, 3=feeding
  matingState: Int32Array;      // 0-6 for different states
  targetFoodId: Int32Array;
  targetMateId: Int32Array;
}
```

### Memory Layout

Each bird uses approximately 88 bytes:
- 15 Float32 arrays × 4 bytes = 60 bytes
- 7 Int32 arrays × 4 bytes = 28 bytes

For 10,000 birds: ~880 KB total

### Enum Mappings for GPU

```typescript
export const FeedingStateMap = {
  'none': 0,
  'approaching': 1,
  'gathering': 2,
  'feeding': 3
} as const;

export const MatingStateMap = {
  'none': 0,
  'seeking': 1,
  'approaching': 2,
  'courting': 3,
  'mating': 4,
  'fighting': 5,
  'cooldown': 6
} as const;

export const GenderMap = {
  'female': 0,
  'male': 1
} as const;
```

---

## Reynolds' Boids Algorithm

### SwarmRules Class (`src/simulation/SwarmRules.ts`)

The core flocking algorithm implements three rules proposed by Craig Reynolds in 1986:

### Rule 1: Alignment

Birds adjust velocity to match nearby neighbors.

```typescript
private calculateAlignment(bird: Bird, neighbors: Bird[], config: ISimulationConfig): void {
  tempAlignment.zero();
  let totalWeight = 0;
  
  for (let i = 0; i < neighbors.length; i++) {
    const other = neighbors[i];
    const dx = bird.position.x - other.position.x;
    const dy = bird.position.y - other.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Distance-weighted influence (closer = stronger)
    const weight = 1 - (distance / config.perceptionRadius);
    
    // Sum weighted velocities
    tempAlignment.x += other.velocity.x * weight;
    tempAlignment.y += other.velocity.y * weight;
    totalWeight += weight;
  }
  
  if (totalWeight > 0) {
    // Average velocity
    tempAlignment.div(totalWeight);
    
    // Steering = desired - current
    tempAlignment.setMag(config.maxSpeed);
    tempAlignment.sub(bird.velocity);
    tempAlignment.limit(config.maxForce);
  }
}
```

**Mathematical Formula**:
```
alignment = Σ(neighbor.velocity × weight) / Σ(weight)
steering = normalize(alignment) × maxSpeed - velocity
```

### Rule 2: Cohesion

Birds move toward the local center of mass.

```typescript
private calculateCohesion(bird: Bird, neighbors: Bird[], config: ISimulationConfig): void {
  tempCohesion.zero();
  let totalWeight = 0;
  
  for (let i = 0; i < neighbors.length; i++) {
    const other = neighbors[i];
    const dx = bird.position.x - other.position.x;
    const dy = bird.position.y - other.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    const weight = 1 - (distance / config.perceptionRadius);
    
    // Sum weighted positions
    tempCohesion.x += other.position.x * weight;
    tempCohesion.y += other.position.y * weight;
    totalWeight += weight;
  }
  
  if (totalWeight > 0) {
    // Center of mass
    tempCohesion.div(totalWeight);
    
    // Vector pointing from bird to center
    tempCohesion.sub(bird.position);
    
    // Density adaptation: reduce cohesion when crowded
    const densityFactor = Math.max(0.3, 1 - neighbors.length / 20);
    tempCohesion.mult(densityFactor);
    
    // Steering
    tempCohesion.setMag(config.maxSpeed);
    tempCohesion.sub(bird.velocity);
    tempCohesion.limit(config.maxForce);
  }
}
```

**Mathematical Formula**:
```
center = Σ(neighbor.position × weight) / Σ(weight)
desired = center - position
steering = normalize(desired) × maxSpeed - velocity
```

### Rule 3: Separation

Birds avoid crowding neighbors within separation radius.

```typescript
private calculateSeparation(bird: Bird, neighbors: Bird[], config: ISimulationConfig): void {
  tempSeparation.zero();
  let count = 0;
  
  const sepRadiusSq = config.separationRadius * config.separationRadius;
  
  for (let i = 0; i < neighbors.length; i++) {
    const other = neighbors[i];
    const dx = bird.position.x - other.position.x;
    const dy = bird.position.y - other.position.y;
    const distSq = dx * dx + dy * dy;
    
    // Only apply within separation radius
    if (distSq < sepRadiusSq && distSq > 0) {
      const distance = Math.sqrt(distSq);
      
      // Inverse square weighting: closer = much stronger
      const invDistSq = 1 / distSq;
      tempSeparation.x += (dx / distance) * invDistSq;
      tempSeparation.y += (dy / distance) * invDistSq;
      count++;
    }
  }
  
  if (count > 0) {
    tempSeparation.div(count);
    
    if (!tempSeparation.isZero()) {
      tempSeparation.setMag(config.maxSpeed);
      tempSeparation.sub(bird.velocity);
      tempSeparation.limit(config.maxForce);
    }
  }
}
```

**Mathematical Formula**:
```
For each neighbor within separationRadius:
  diff = position - neighbor.position
  separation += normalize(diff) × (1 / distance²)

separation /= count
steering = normalize(separation) × maxSpeed - velocity
```

### Force Combination

```typescript
calculate(
  bird: Bird,
  neighbors: Bird[],
  config: ISimulationConfig,
  envConfig: IEnvironmentConfig,
  time: number,
  outForce: Vector2
): void {
  outForce.zero();
  
  if (neighbors.length === 0) {
    this.addNoise(bird, outForce, time, 0.1);
    return;
  }
  
  // Calculate each rule
  this.calculateAlignment(bird, neighbors, config);
  this.calculateCohesion(bird, neighbors, config);
  this.calculateSeparation(bird, neighbors, config);
  
  // Apply weights and combine
  outForce.x = tempAlignment.x * config.alignmentWeight +
               tempCohesion.x * config.cohesionWeight +
               tempSeparation.x * config.separationWeight;
  outForce.y = tempAlignment.y * config.alignmentWeight +
               tempCohesion.y * config.cohesionWeight +
               tempSeparation.y * config.separationWeight;
  
  // Add natural variation via Perlin noise
  this.addNoise(bird, outForce, time, 0.05);
  
  // Limit total force (boosted by panic)
  outForce.limit(config.maxForce * (1 + bird.panicLevel));
  
  // Update local density for visualization
  bird.localDensity = neighbors.length;
}
```

### Noise Injection

For natural movement variation using Perlin noise:

```typescript
private addNoise(bird: Bird, force: Vector2, time: number, strength: number): void {
  const nx = bird.position.x * this.noiseScale + time * 0.5;
  const ny = bird.position.y * this.noiseScale + bird.id * 0.1;
  
  // noise() returns -1 to 1
  const noiseVal = noise(nx, ny);
  
  // Apply as rotational force
  const angle = noiseVal * Math.PI * strength;
  tempSteer.copy(bird.velocity).rotate(angle).mult(0.1);
  force.add(tempSteer);
}
```

---

## Panic Response

```typescript
calculatePanicResponse(
  bird: Bird,
  predatorPosition: Vector2,
  panicRadius: number,
  maxForce: number,
  outForce: Vector2
): void {
  const dx = bird.position.x - predatorPosition.x;
  const dy = bird.position.y - predatorPosition.y;
  const distSq = dx * dx + dy * dy;
  const panicRadiusSq = panicRadius * panicRadius;
  
  if (distSq < panicRadiusSq) {
    const distance = Math.sqrt(distSq);
    
    // Panic level: closer = more panic (0 at edge, 1 at center)
    const panicLevel = 1 - (distance / panicRadius);
    bird.applyPanic(panicLevel);
    
    // Flee force (away from predator)
    if (distance > 0) {
      const forceMag = maxForce * (1 + panicLevel * 2);
      outForce.x = (dx / distance) * forceMag;
      outForce.y = (dy / distance) * forceMag;
    } else {
      outForce.zero();
    }
  } else {
    outForce.zero();
  }
}
```

### Panic Propagation

Panic spreads through the flock via neighbor connections:

```typescript
// In Flock.fixedUpdate()
if (bird.panicLevel > 0.3) {
  const panicSpread = bird.panicLevel * envConfig.panicDecay * 0.5;
  for (const neighbor of neighbors) {
    neighbor.applyPanic(panicSpread);
  }
}
```

---

## Attractor/Repulsor Forces

```typescript
calculateAttractorForce(
  bird: Bird,
  attractorX: number,
  attractorY: number,
  strength: number,
  radius: number,
  isRepulsor: boolean,
  maxForce: number,
  outForce: Vector2
): void {
  const dx = attractorX - bird.position.x;
  const dy = attractorY - bird.position.y;
  const distSq = dx * dx + dy * dy;
  const radiusSq = radius * radius;
  
  if (distSq < radiusSq && distSq > 0) {
    const distance = Math.sqrt(distSq);
    
    // Strength falls off linearly with distance
    const factor = 1 - (distance / radius);
    let forceMag = strength * factor * maxForce;
    
    if (isRepulsor) {
      forceMag = -forceMag;  // Reverse direction
    }
    
    outForce.x = (dx / distance) * forceMag;
    outForce.y = (dy / distance) * forceMag;
  } else {
    outForce.zero();
  }
}
```

---

## Configuration Parameters

### Simulation Config

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `birdCount` | number | 2000 | Number of birds in simulation |
| `particleSize` | number | 1.0 | Visual size multiplier |
| `maxSpeed` | number | 15 | Maximum velocity magnitude |
| `maxForce` | number | 0.5 | Maximum steering force |
| `perceptionRadius` | number | 50 | Distance for neighbor detection |
| `separationRadius` | number | 25 | Distance for separation rule |
| `alignmentWeight` | number | 1.0 | Alignment rule strength |
| `cohesionWeight` | number | 1.0 | Cohesion rule strength |
| `separationWeight` | number | 1.5 | Separation rule strength |
| `fieldOfView` | number | 270 | Vision cone in degrees |
| `boundaryMargin` | number | 100 | Edge avoidance margin |
| `boundaryForce` | number | 0.8 | Edge avoidance strength |
| `simulationSpeed` | number | 1.0 | Time multiplier |
| `noiseStrength` | number | 0.05 | Random variation strength |
| `wanderStrength` | number | 0.1 | Wandering behavior strength |
| `energyEnabled` | boolean | false | Enable energy system |
| `energyDecayRate` | number | 0.02 | Energy drain per second |
| `minEnergySpeed` | number | 0.3 | Minimum speed at zero energy |
| `foodEnergyRestore` | number | 0.3 | Energy restored per second when feeding |

### Typical Presets

| Creature | maxSpeed | maxForce | perceptionRadius | alignmentWeight | cohesionWeight | separationWeight |
|----------|----------|----------|------------------|-----------------|----------------|------------------|
| Starlings | 15 | 0.5 | 50 | 1.0 | 1.0 | 1.5 |
| Insects | 25 | 1.2 | 30 | 0.5 | 1.5 | 2.0 |
| Fish | 10 | 0.3 | 60 | 1.5 | 1.2 | 1.0 |
| Fireflies | 5 | 0.2 | 80 | 0.3 | 0.5 | 1.0 |
| Locusts | 30 | 1.5 | 35 | 1.8 | 2.0 | 0.5 |
