# Physics and Movement Algorithms

## Overview

This document provides complete implementation details for all physics and movement algorithms in the simulation, covering:

1. Vector Mathematics
2. Physics Integration Model
3. Boids Steering Behaviors
4. Environmental Forces
5. Behavioral Movement Systems
6. Predator Movement Algorithms

---

## 1. Vector Mathematics

### Vector2 Class

The foundation of all physics calculations is the mutable `Vector2` class, optimized for zero-allocation operations.

#### Core Properties

```typescript
class Vector2 {
  x: number;
  y: number;
}
```

#### Magnitude Operations

```typescript
// Magnitude (length)
mag(): number {
  return Math.sqrt(this.x * this.x + this.y * this.y);
}

// Squared magnitude (faster, no sqrt)
magSq(): number {
  return this.x * this.x + this.y * this.y;
}

// Normalize to unit vector
normalize(): this {
  const m = this.mag();
  if (m > 0) {
    this.x /= m;
    this.y /= m;
  }
  return this;
}

// Set magnitude to specific value
setMag(mag: number): this {
  return this.normalize().mult(mag);
}

// Limit magnitude to maximum
limit(max: number): this {
  const magSq = this.magSq();
  if (magSq > max * max) {
    const m = Math.sqrt(magSq);
    this.x = (this.x / m) * max;
    this.y = (this.y / m) * max;
  }
  return this;
}
```

#### Arithmetic Operations

```typescript
// Addition (mutates this)
add(v: IVector2): this {
  this.x += v.x;
  this.y += v.y;
  return this;
}

// Subtraction (mutates this)
sub(v: IVector2): this {
  this.x -= v.x;
  this.y -= v.y;
  return this;
}

// Scalar multiplication
mult(scalar: number): this {
  this.x *= scalar;
  this.y *= scalar;
  return this;
}

// Scalar division
div(scalar: number): this {
  if (scalar !== 0) {
    this.x /= scalar;
    this.y /= scalar;
  }
  return this;
}
```

#### Rotation Operations

```typescript
// Get heading angle (radians)
heading(): number {
  return Math.atan2(this.y, this.x);
}

// Rotate by angle (radians)
rotate(angle: number): this {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const x = this.x * cos - this.y * sin;
  const y = this.x * sin + this.y * cos;
  this.x = x;
  this.y = y;
  return this;
}
```

#### Distance and Dot Product

```typescript
// Euclidean distance
dist(v: IVector2): number {
  const dx = this.x - v.x;
  const dy = this.y - v.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Squared distance (faster)
distSq(v: IVector2): number {
  const dx = this.x - v.x;
  const dy = this.y - v.y;
  return dx * dx + dy * dy;
}

// Dot product
dot(v: IVector2): number {
  return this.x * v.x + this.y * v.y;
}

// Cross product (2D returns scalar)
cross(v: IVector2): number {
  return this.x * v.y - this.y * v.x;
}
```

#### Static Factory Methods

```typescript
// Create from angle
static fromAngle(angle: number, magnitude: number = 1): Vector2 {
  return new Vector2(
    Math.cos(angle) * magnitude,
    Math.sin(angle) * magnitude
  );
}

// Random unit vector
static random(): Vector2 {
  const angle = Math.random() * Math.PI * 2;
  return new Vector2(Math.cos(angle), Math.sin(angle));
}

// Linear interpolation
static lerp(a: IVector2, b: IVector2, t: number, out: Vector2): Vector2 {
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  return out;
}
```

---

## 2. Physics Integration Model

### Semi-Implicit Euler Integration

The simulation uses semi-implicit Euler integration for stability:

```
1. acceleration = sum(all forces)
2. velocity += acceleration × dt × 60
3. velocity = limit(velocity, maxSpeed)
4. position += velocity × dt × simulationSpeed
5. acceleration = 0  (clear for next frame)
```

### Bird Physics Update

```typescript
update(
  deltaTime: number,
  config: ISimulationConfig,
  energyEnabled: boolean = false,
  energyDecayRate: number = 0.01,
  minEnergySpeed: number = 0.3
): void {
  // === STEP 1: Apply acceleration to velocity ===
  // Scale by 60 for frame-rate independence (designed for 60 FPS)
  const accelMult = deltaTime * 60;
  this.velocity.x += this.acceleration.x * accelMult;
  this.velocity.y += this.acceleration.y * accelMult;

  // === STEP 2: Calculate effective maximum speed ===
  let effectiveMaxSpeed = config.maxSpeed;

  // Energy affects speed (0-100% based on energy level)
  if (energyEnabled) {
    // At energy=0: speed = maxSpeed × minEnergySpeed (30%)
    // At energy=1: speed = maxSpeed × 1.0 (100%)
    const energyMultiplier = minEnergySpeed + (1 - minEnergySpeed) * this.energy;
    effectiveMaxSpeed *= energyMultiplier;
  }

  // Panic boosts speed by up to 50%
  effectiveMaxSpeed *= (1 + this.panicLevel * 0.5);

  // === STEP 3: Limit velocity magnitude ===
  this.velocity.limit(effectiveMaxSpeed);

  // === STEP 4: Update position ===
  const velMult = deltaTime * config.simulationSpeed;
  this.position.x += this.velocity.x * velMult;
  this.position.y += this.velocity.y * velMult;

  // === STEP 5: Cache heading for rendering ===
  const velMagSq = this.velocity.x * this.velocity.x + this.velocity.y * this.velocity.y;
  if (velMagSq > 0.01) {
    this._heading = Math.atan2(this.velocity.y, this.velocity.x);
  }

  // === STEP 6: Clear acceleration ===
  this.acceleration.x = 0;
  this.acceleration.y = 0;

  // === STEP 7: Decay panic level (exponential) ===
  if (this.panicLevel > 0) {
    this.panicLevel *= 0.98;  // ~2% decay per frame
    if (this.panicLevel < 0.01) this.panicLevel = 0;
  }

  // === STEP 8: Decay energy based on speed ===
  if (energyEnabled && this.energy > 0) {
    const speedFactor = 1 + (this.speed / config.maxSpeed) * 0.5;
    this.energy -= energyDecayRate * deltaTime * speedFactor;
    if (this.energy < 0) this.energy = 0;
  }

  // === STEP 9: Decay mating cooldown ===
  if (this.matingCooldown > 0) {
    this.matingCooldown -= deltaTime;
    if (this.matingCooldown < 0) this.matingCooldown = 0;
  }
}
```

### Fixed Timestep Accumulator

```typescript
private readonly fixedDeltaTime: number = 1 / 60;  // 60 Hz physics
private accumulator: number = 0;

update(deltaTime: number): void {
  // Prevent spiral of death with large frames
  deltaTime = Math.min(deltaTime, 0.1);
  
  // Accumulate time
  this.accumulator += deltaTime * config.simulationSpeed;
  
  // Run fixed updates
  while (this.accumulator >= this.fixedDeltaTime) {
    this.fixedUpdate(this.fixedDeltaTime);
    this.accumulator -= this.fixedDeltaTime;
    this.simulationTime += this.fixedDeltaTime;
  }
}
```

---

## 3. Boids Steering Behaviors

### Steering Force Formula

All steering behaviors use Reynolds' steering formula:

```
steering = desired_velocity - current_velocity
steering = limit(steering, maxForce)
```

### 3.1 Alignment

**Goal**: Match velocity with nearby neighbors

```typescript
calculateAlignment(bird: Bird, neighbors: Bird[], config: ISimulationConfig): void {
  tempAlignment.zero();
  let totalWeight = 0;
  
  for (let i = 0; i < neighbors.length; i++) {
    const other = neighbors[i];
    
    // Calculate distance
    const dx = bird.position.x - other.position.x;
    const dy = bird.position.y - other.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Distance-weighted influence (closer = stronger)
    const weight = 1 - (distance / config.perceptionRadius);
    
    // Accumulate weighted velocities
    tempAlignment.x += other.velocity.x * weight;
    tempAlignment.y += other.velocity.y * weight;
    totalWeight += weight;
  }
  
  if (totalWeight > 0) {
    // Calculate average velocity
    tempAlignment.div(totalWeight);
    
    // Convert to steering force
    tempAlignment.setMag(config.maxSpeed);
    tempAlignment.sub(bird.velocity);
    tempAlignment.limit(config.maxForce);
  }
}
```

**Mathematical Formula**:
```
alignment = Σ(neighbor.velocity × weight) / Σ(weight)
where weight = 1 - (distance / perceptionRadius)

desired = normalize(alignment) × maxSpeed
steering = desired - velocity
```

### 3.2 Cohesion

**Goal**: Move toward local center of mass

```typescript
calculateCohesion(bird: Bird, neighbors: Bird[], config: ISimulationConfig): void {
  tempCohesion.zero();
  let totalWeight = 0;
  
  for (let i = 0; i < neighbors.length; i++) {
    const other = neighbors[i];
    const dx = bird.position.x - other.position.x;
    const dy = bird.position.y - other.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    const weight = 1 - (distance / config.perceptionRadius);
    
    // Accumulate weighted positions
    tempCohesion.x += other.position.x * weight;
    tempCohesion.y += other.position.y * weight;
    totalWeight += weight;
  }
  
  if (totalWeight > 0) {
    // Calculate center of mass
    tempCohesion.div(totalWeight);
    
    // Vector from bird to center
    tempCohesion.sub(bird.position);
    
    // Density adaptation: reduce cohesion when crowded
    const densityFactor = Math.max(0.3, 1 - neighbors.length / 20);
    tempCohesion.mult(densityFactor);
    
    // Convert to steering
    tempCohesion.setMag(config.maxSpeed);
    tempCohesion.sub(bird.velocity);
    tempCohesion.limit(config.maxForce);
  }
}
```

**Mathematical Formula**:
```
center = Σ(neighbor.position × weight) / Σ(weight)
direction = center - position
direction *= densityFactor  (where densityFactor = max(0.3, 1 - neighborCount/20))

desired = normalize(direction) × maxSpeed
steering = desired - velocity
```

### 3.3 Separation

**Goal**: Avoid crowding (inverse square weighting)

```typescript
calculateSeparation(bird: Bird, neighbors: Bird[], config: ISimulationConfig): void {
  tempSeparation.zero();
  let count = 0;
  
  const sepRadiusSq = config.separationRadius * config.separationRadius;
  
  for (let i = 0; i < neighbors.length; i++) {
    const other = neighbors[i];
    const dx = bird.position.x - other.position.x;
    const dy = bird.position.y - other.position.y;
    const distSq = dx * dx + dy * dy;
    
    // Only within separation radius
    if (distSq < sepRadiusSq && distSq > 0) {
      const distance = Math.sqrt(distSq);
      
      // Inverse square weighting: closer = MUCH stronger
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
  diff = myPosition - neighborPosition
  separation += normalize(diff) × (1 / distance²)

separation /= count
desired = normalize(separation) × maxSpeed
steering = desired - velocity
```

### 3.4 Force Combination

```typescript
calculate(bird, neighbors, config, envConfig, time, outForce): void {
  outForce.zero();
  
  if (neighbors.length === 0) {
    this.addNoise(bird, outForce, time, 0.1);
    return;
  }

  // Calculate each rule
  this.calculateAlignment(bird, neighbors, config);
  this.calculateCohesion(bird, neighbors, config);
  this.calculateSeparation(bird, neighbors, config);
  
  // Weighted combination
  outForce.x = tempAlignment.x * config.alignmentWeight +
               tempCohesion.x * config.cohesionWeight +
               tempSeparation.x * config.separationWeight;
  outForce.y = tempAlignment.y * config.alignmentWeight +
               tempCohesion.y * config.cohesionWeight +
               tempSeparation.y * config.separationWeight;
  
  // Add Perlin noise for natural variation
  this.addNoise(bird, outForce, time, 0.05);
  
  // Limit total force (boosted by panic)
  outForce.limit(config.maxForce * (1 + bird.panicLevel));
  
  // Update density for visualization
  bird.localDensity = neighbors.length;
}
```

---

## 4. Environmental Forces

### 4.1 Wind Force

Wind applies a directional force with Perlin noise turbulence:

```typescript
getForceAt(x: number, y: number, config: IEnvironmentConfig): Vector2 {
  if (config.windSpeed === 0) {
    return new Vector2(0, 0);
  }
  
  // Base wind force from direction
  const directionRad = config.windDirection * Math.PI / 180;
  const force = new Vector2(
    Math.cos(directionRad) * config.windSpeed,
    Math.sin(directionRad) * config.windSpeed
  );
  
  // Add turbulence (position-based variation)
  if (config.windTurbulence > 0) {
    const nx = x * 0.003 + this.time;  // noiseScale = 0.003
    const ny = y * 0.003;
    
    // Multi-octave noise for complexity
    const turbX = fbmNoise(nx, ny, 3) * config.windTurbulence * config.windSpeed * 0.5;
    const turbY = fbmNoise(nx + 100, ny + 100, 3) * config.windTurbulence * config.windSpeed * 0.5;
    
    force.x += turbX;
    force.y += turbY;
  }
  
  // Scale to reasonable force
  force.mult(0.01);
  
  return force;
}
```

### 4.2 Boundary Avoidance

Soft force field at screen edges:

```typescript
applyBoundaryForce(width: number, height: number, margin: number, force: number): void {
  tempBoundary.zero();
  
  const x = this.position.x;
  const y = this.position.y;
  const rightEdge = width - margin;
  const bottomEdge = height - margin;
  
  // Force strength proportional to penetration depth
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
  
  // Apply to acceleration
  this.acceleration.x += tempBoundary.x;
  this.acceleration.y += tempBoundary.y;
}
```

**Mathematical Formula**:
```
penetration = margin - distance_from_edge
force = boundaryForce × (penetration / margin)
```

### 4.3 Attractor/Repulsor Force

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
    
    // Linear falloff with distance
    const factor = 1 - (distance / radius);
    let forceMag = strength * factor * maxForce;
    
    // Reverse direction for repulsor
    if (isRepulsor) {
      forceMag = -forceMag;
    }
    
    outForce.x = (dx / distance) * forceMag;
    outForce.y = (dy / distance) * forceMag;
  } else {
    outForce.zero();
  }
}
```

### 4.4 Panic Response

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
    
    // Flee force away from predator
    if (distance > 0) {
      const forceMag = maxForce * (1 + panicLevel * 2);  // Up to 3× force
      outForce.x = (dx / distance) * forceMag;
      outForce.y = (dy / distance) * forceMag;
    }
  } else {
    outForce.zero();
  }
}
```

---

## 5. Behavioral Movement Systems

### 5.1 Seek Behavior (Arrival)

Move toward target with arrival slowdown:

```typescript
seek(target: Vector2, maxSpeed: number, maxForce: number): Vector2 {
  const desired = tempVec.copy(target).sub(this.position);
  const distance = desired.mag();
  
  if (distance > 0) {
    desired.normalize();
    
    // Arrival: slow down within 100 units
    if (distance < 100) {
      desired.mult(maxSpeed * (distance / 100));
    } else {
      desired.mult(maxSpeed);
    }
    
    // Steering
    const steer = desired.sub(this.velocity);
    steer.limit(maxForce);
    return steer.clone();
  }
  
  return new Vector2();
}
```

### 5.2 Flee Behavior

Move away from target:

```typescript
flee(target: Vector2, maxSpeed: number, maxForce: number): Vector2 {
  const desired = tempVec.copy(this.position).sub(target);
  const distance = desired.mag();
  
  if (distance > 0) {
    desired.normalize().mult(maxSpeed);
    const steer = desired.sub(this.velocity);
    steer.limit(maxForce);
    return steer.clone();
  }
  
  return new Vector2();
}
```

### 5.3 Food Approaching Force

Direct movement toward food with arrival:

```typescript
calculateApproachingForce(bird, foodPosition, maxSpeed, maxForce, outForce): void {
  const dx = foodPosition.x - bird.position.x;
  const dy = foodPosition.y - bird.position.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  
  if (dist < 1) return;
  
  // Desired velocity toward food
  tempGather.x = dx / dist * maxSpeed;
  tempGather.y = dy / dist * maxSpeed;
  
  // Arrival: slow down within 50 units
  if (dist < 50) {
    tempGather.mult(dist / 50);
  }
  
  // Steering
  tempGather.sub(bird.velocity);
  tempGather.limit(maxForce);
  
  outForce.x = tempGather.x;
  outForce.y = tempGather.y;
}
```

### 5.4 Gathering Force (Orbital Motion)

Circular orbiting around food:

```typescript
calculateGatheringForce(bird, foodPosition, gatherRadius, behaviorType, maxSpeed, maxForce, outForce): void {
  const dx = foodPosition.x - bird.position.x;
  const dy = foodPosition.y - bird.position.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  
  // Normalized direction to food
  const toFoodX = dx / dist;
  const toFoodY = dy / dist;
  
  // Tangent for circular motion (perpendicular)
  tempTangent.x = -toFoodY;
  tempTangent.y = toFoodX;
  
  // Orbit speed with variation per bird
  const orbitSpeed = maxSpeed * 0.5 * (0.8 + (bird.id % 10) * 0.04);
  
  // Radial force to maintain orbit distance
  const distanceError = dist - gatherRadius;
  const radialStrength = Math.min(1, Math.abs(distanceError) / gatherRadius);
  
  // Combine radial and tangential
  tempGather.x = toFoodX * distanceError * radialStrength + tempTangent.x * orbitSpeed;
  tempGather.y = toFoodY * distanceError * radialStrength + tempTangent.y * orbitSpeed;
  
  // Steering
  tempGather.sub(bird.velocity);
  tempGather.limit(maxForce);
  
  outForce.copy(tempGather);
}
```

### 5.5 Feeding Force (Stationary)

Strong damping to stay at food:

```typescript
calculateFeedingForce(bird, foodPosition, maxSpeed, maxForce, outForce): void {
  const dx = foodPosition.x - bird.position.x;
  const dy = foodPosition.y - bird.position.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  
  if (dist < 5) {
    // Very close: apply damping to stop
    outForce.x = -bird.velocity.x * 0.3;
    outForce.y = -bird.velocity.y * 0.3;
    return;
  }
  
  // Slow approach + damping
  tempFeed.set(dx, dy).normalize().mult(maxSpeed * 0.3);
  tempFeed.sub(bird.velocity);
  tempFeed.limit(maxForce);
  
  outForce.x = tempFeed.x - bird.velocity.x * 0.2;
  outForce.y = tempFeed.y - bird.velocity.y * 0.2;
}
```

---

## 6. Predator Movement Algorithms

### 6.1 Base Predator Physics

```typescript
update(deltaTime, config, birds, flockCenter): void {
  this.time += deltaTime;
  this.stateTime += deltaTime;
  
  // Update cooldown
  if (this.cooldown > 0) this.cooldown -= deltaTime;
  
  // Energy management
  this.updateEnergy(deltaTime);
  
  // Check exhaustion
  if (this.energy <= this.stats.exhaustionThreshold && 
      this.state !== 'recovering' && this.state !== 'idle') {
    this.setState('recovering');
    this.failedHunts++;
  }
  
  // Subclass behavior
  this.updateBehavior(deltaTime, config, birds, flockCenter);
  
  // Apply physics
  const speedMultiplier = this.getSpeedMultiplier(config);
  this.velocity.limit(this.maxSpeed * speedMultiplier);
  this.position.add(new Vector2(
    this.velocity.x * deltaTime,
    this.velocity.y * deltaTime
  ));
  
  this.applyBoundaryForce();
}
```

### 6.2 Steering Method

```typescript
steerToward(targetX: number, targetY: number, speedMult: number = 1, forceMult: number = 1): void {
  tempToTarget.set(targetX - this.position.x, targetY - this.position.y);
  tempSteer.copy(tempToTarget).normalize().mult(this.maxSpeed * speedMult);
  tempSteer.sub(this.velocity).limit(this.maxForce * forceMult);
  this.velocity.add(tempSteer);
}
```

### 6.3 Hawk: Edge Hunting with Circling

```typescript
// Scanning: Circle around flock perimeter
updateScanning(deltaTime, config, birds, flockCenter): void {
  // Update circle angle
  this.circleAngle += deltaTime * 0.5;
  
  // Calculate position on circle
  tempCircle.set(
    flockCenter.x + Math.cos(this.circleAngle) * this.circleRadius,
    flockCenter.y + Math.sin(this.circleAngle) * this.circleRadius
  );
  
  this.steerToward(tempCircle.x, tempCircle.y, 0.8, 0.6);
  
  // Look for isolated targets
  const bestTarget = this.findBestTarget(birds, flockCenter);
  if (bestTarget && bestTarget.isolationScore > 0.4) {
    this.target = new Vector2(bestTarget.position.x, bestTarget.position.y);
    this.targetBirdId = bestTarget.birdId;
    this.setState('stalking');
  }
}

// Hunting: Pursuit with burst capability
updateHunting(deltaTime, config, birds, flockCenter): void {
  const targetBird = birds.find(b => b.id === this.targetBirdId);
  if (!targetBird) { /* handle loss */ }
  
  this.target = targetBird.position.clone();
  
  // Calculate intercept point
  const interceptX = targetBird.position.x + targetBird.velocity.x * 0.5;
  const interceptY = targetBird.position.y + targetBird.velocity.y * 0.5;
  
  // Trigger burst when close
  const distToTarget = this.position.dist(targetBird.position);
  if (distToTarget < 120 && !this.isBursting && this.energy > this.stats.attackCost * 1.5) {
    this.isBursting = true;
    this.burstTimer = 1.5;
  }
  
  // Apply burst multipliers
  const speedMult = this.isBursting ? 1.4 : 1.1;
  const forceMult = this.isBursting ? 1.8 : 1.0;
  this.steerToward(interceptX, interceptY, speedMult, forceMult);
}
```

**Hawk Target Weights**:
```typescript
{ isolation: 1.5, edge: 1.2, velocity: 0.8, panic: 0.3, intercept: 1.0 }
```

### 6.4 Falcon: Stoop Diving

```typescript
// Climbing: Gain altitude while tracking
updateClimbing(deltaTime, config, birds, flockCenter): void {
  // Increase altitude
  this.altitude = Math.min(this.maxAltitude, this.altitude + this.climbRate * deltaTime);
  
  const targetBird = birds.find(b => b.id === this.targetBirdId);
  this.target = targetBird.position.clone();
  
  // Position above and ahead of target
  const leadTime = 1.5;
  const interceptX = targetBird.position.x + targetBird.velocity.x * leadTime;
  const interceptY = targetBird.position.y + targetBird.velocity.y * leadTime;
  
  this.steerToward(interceptX, interceptY, 0.5, 0.4);
  
  // Ready to dive?
  if (this.altitude >= this.minDiveAltitude && this.energy > this.stats.attackCost) {
    const distToTarget = this.position.dist(targetBird.position);
    if (distToTarget > 100 && distToTarget < 350) {
      this.initiateDive(targetBird);
    }
  }
}

// Diving: High-speed descent
updateDiving(deltaTime, config, birds): void {
  // Rapidly lose altitude
  this.altitude = Math.max(0, this.altitude - deltaTime * 2);
  
  // Heavy energy drain
  this.energy -= this.stats.huntingDrain * 2 * deltaTime;
  
  // Update intercept
  const targetBird = birds.find(b => b.id === this.targetBirdId);
  if (targetBird) {
    const leadTime = 0.3;
    this.target = new Vector2(
      targetBird.position.x + targetBird.velocity.x * leadTime,
      targetBird.position.y + targetBird.velocity.y * leadTime
    );
  }
  
  // Aggressive steering at dive speed (3.5× normal)
  this.steerToward(this.target.x, this.target.y, this.diveSpeedMultiplier, 3.0);
}

// Panic radius reduced at altitude
getEffectivePanicRadius(): number {
  return this.panicRadius * (1 - this.altitude * 0.6);
}
```

**Falcon Stats**:
- Cruise speed: 18
- Dive speed: 63 (3.5× multiplier)
- Attack cost: 30 energy

### 6.5 Eagle: Sustained Pursuit

```typescript
// Pursuit: Relentless chase that builds momentum
updatePursuit(deltaTime, config, birds, flockCenter): void {
  const targetBird = birds.find(b => b.id === this.lockedTargetId);
  if (!targetBird) { this.setState('scanning'); return; }
  
  // Track pursuit time
  this.pursuitTime += deltaTime;
  this.target = targetBird.position.clone();
  
  // Pursuit bonus increases over time (max 1.4×)
  this.pursuitBonus = Math.min(
    this.maxPursuitBonus,  // 1.4
    1.0 + this.pursuitTime * this.pursuitBonusRate  // 0.02 per second
  );
  
  // Simulate target exhaustion
  this.targetExhaustion = Math.min(0.3, this.pursuitTime * 0.015);
  
  // Calculate intercept with pursuit bonus
  const leadFactor = 0.3 + this.pursuitBonus * 0.2;
  const interceptX = targetBird.position.x + targetBird.velocity.x * leadFactor;
  const interceptY = targetBird.position.y + targetBird.velocity.y * leadFactor;
  
  // Pursue with increasing effectiveness
  this.steerToward(interceptX, interceptY, this.pursuitBonus, 0.8);
}
```

**Eagle Target Weights**:
```typescript
{ isolation: 0.4, edge: 0.3, velocity: 1.2, panic: 0.8, intercept: 0.6 }
// Prefers slower birds and predictable movement
```

### 6.6 Owl: Ambush

```typescript
// Ambush: Wait motionless for prey
updateAmbush(deltaTime, config, birds, flockCenter): void {
  this.ambushTime += deltaTime;
  this.isStealthed = true;
  
  // Nearly stationary
  this.velocity.mult(0.95);
  
  // Regenerate energy while waiting
  this.energy = Math.min(
    this.stats.maxEnergy,
    this.energy + this.stats.energyRegenRate * 0.5 * deltaTime
  );
  
  // Look for targets within strike range (70 units)
  if (this.ambushTime >= this.minWaitTime) {
    const nearbyTarget = this.findNearbyTarget(birds);
    if (nearbyTarget) {
      this.target = nearbyTarget.position.clone();
      this.targetBirdId = nearbyTarget.id;
      this.isStealthed = false;
      this.setState('attacking');
    }
  }
}

// Strike: Lightning-fast attack
updateStrike(deltaTime, config, birds): void {
  this.isStealthed = false;
  
  const targetBird = birds.find(b => b.id === this.targetBirdId);
  if (targetBird) {
    const leadTime = 0.15;
    this.target = new Vector2(
      targetBird.position.x + targetBird.velocity.x * leadTime,
      targetBird.position.y + targetBird.velocity.y * leadTime
    );
  }
  
  // Ultra-fast strike (28 speed vs 8 normal)
  const strikeMult = this.strikeSpeed / this.maxSpeed;  // 28/8 = 3.5
  this.steerToward(this.target.x, this.target.y, strikeMult, 3.5);
}

// Stealth reduces panic radius
getEffectivePanicRadius(): number {
  return this.isStealthed ? this.stealthRadius : this.panicRadius;  // 40 vs 80
}
```

### 6.7 Shark: Circling Pursuit

```typescript
// Scanning: Circle around school
updateScanning(deltaTime, config, birds, flockCenter): void {
  // Slow, menacing circling
  this.circleAngle += deltaTime * 0.4;
  
  // Adjust radius based on school size
  const idealRadius = Math.max(180, Math.min(300, birds.length * 0.8));
  this.circleRadius += (idealRadius - this.circleRadius) * deltaTime;
  
  tempCircle.set(
    flockCenter.x + Math.cos(this.circleAngle) * this.circleRadius,
    flockCenter.y + Math.sin(this.circleAngle) * this.circleRadius
  );
  
  this.steerToward(tempCircle.x, tempCircle.y, 0.7, 0.5);
}

// Stalking: Spiral approach
updateStalking(deltaTime, config, birds, flockCenter): void {
  const targetBird = birds.find(b => b.id === this.lockedTargetId);
  this.target = targetBird.position.clone();
  
  // Spiral in toward target
  this.circleAngle += deltaTime * 0.5;
  const currentDist = this.position.dist(targetBird.position);
  const spiralRadius = Math.max(80, currentDist * 0.7);
  
  tempCircle.set(
    targetBird.position.x + Math.cos(this.circleAngle) * spiralRadius,
    targetBird.position.y + Math.sin(this.circleAngle) * spiralRadius
  );
  
  this.steerToward(tempCircle.x, tempCircle.y, 0.85, 0.6);
}

// Pursuit: Tracking bonus builds
updatePursuit(deltaTime, config, birds, flockCenter): void {
  this.pursuitTime += deltaTime;
  
  // Tracking bonus (max 1.35×)
  this.trackingBonus = Math.min(1.35, 1.0 + this.pursuitTime * 0.025);
  
  // Enhanced intercept calculation
  const leadFactor = 0.4 * this.trackingBonus;
  const interceptX = targetBird.position.x + targetBird.velocity.x * leadFactor;
  const interceptY = targetBird.position.y + targetBird.velocity.y * leadFactor;
  
  this.steerToward(interceptX, interceptY, this.trackingBonus, 0.9);
}
```

---

## 7. Perlin Noise System

### Noise for Natural Variation

```typescript
addNoise(bird: Bird, force: Vector2, time: number, strength: number): void {
  // Sample noise at bird's position
  const nx = bird.position.x * this.noiseScale + time * 0.5;
  const ny = bird.position.y * this.noiseScale + bird.id * 0.1;
  
  // Get noise value (-1 to 1)
  const noiseVal = noise(nx, ny);
  
  // Apply as rotational force
  const angle = noiseVal * Math.PI * strength;
  tempSteer.copy(bird.velocity).rotate(angle).mult(0.1);
  force.add(tempSteer);
}
```

### Perlin Noise Implementation

```typescript
class PerlinNoise {
  private permutation: number[];
  private gradients: { x: number; y: number }[];

  noise2D(x: number, y: number): number {
    // Grid cell coordinates
    const x0 = Math.floor(x) & 255;
    const y0 = Math.floor(y) & 255;
    const x1 = (x0 + 1) & 255;
    const y1 = (y0 + 1) & 255;

    // Relative position
    const sx = x - Math.floor(x);
    const sy = y - Math.floor(y);

    // Fade curves (smoothstep)
    const u = this.fade(sx);  // t³(t(t×6-15)+10)
    const v = this.fade(sy);

    // Dot products with gradients
    const n00 = this.dotGridGradient(x0, y0, x, y);
    const n10 = this.dotGridGradient(x1, y0, x, y);
    const n01 = this.dotGridGradient(x0, y1, x, y);
    const n11 = this.dotGridGradient(x1, y1, x, y);

    // Bilinear interpolation
    const nx0 = lerp(n00, n10, u);
    const nx1 = lerp(n01, n11, u);
    return lerp(nx0, nx1, v);
  }

  // Fractal Brownian Motion (layered noise)
  fbm(x: number, y: number, octaves: number = 4): number {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      value += amplitude * this.noise2D(x * frequency, y * frequency);
      maxValue += amplitude;
      amplitude *= 0.5;   // gain
      frequency *= 2;      // lacunarity
    }

    return value / maxValue;
  }
}
```

---

## 8. Speed Reference Table

| Entity | Base Speed | Burst Speed | Notes |
|--------|------------|-------------|-------|
| Bird (Starling) | 15 | 22.5 (panic) | +50% at full panic |
| Hawk | 22 | 39.6 | 1.8× burst |
| Falcon cruise | 18 | - | Normal flight |
| Falcon dive | - | 63 | 3.5× in stoop |
| Eagle | 18 | 25.2 | Builds to 1.4× during pursuit |
| Owl ambush | 8 | 28 | 3.5× strike speed |
| Shark | 16 | 24 | 1.5× attack burst |

---

## 9. Energy System Formulas

```typescript
// Energy decay per second
energyDrain = energyDecayRate × (1 + speedFactor × 0.5)
where speedFactor = currentSpeed / maxSpeed

// Energy-affected max speed
effectiveMaxSpeed = maxSpeed × (minEnergySpeed + (1 - minEnergySpeed) × energy)
// At energy=0: effectiveMaxSpeed = maxSpeed × 0.3
// At energy=1: effectiveMaxSpeed = maxSpeed × 1.0

// Predator hunting energy drain
huntingDrain = stats.huntingDrain × deltaTime
// Example: Hawk drains 12 energy/second while hunting

// Attack energy cost (one-time)
energy -= stats.attackCost
// Example: Hawk spends 20 energy per attack
```

---

## 10. Field of View Check

```typescript
isInFieldOfView(point: Vector2, fovDegrees: number): boolean {
  // If nearly stationary, can see everything
  const velMagSq = this.velocity.magSq();
  if (velMagSq < 0.01) return true;
  
  // Angle to point
  const dx = point.x - this.position.x;
  const dy = point.y - this.position.y;
  const angleToPoint = Math.atan2(dy, dx);
  
  // Angular difference from heading
  let diff = angleToPoint - this._heading;
  
  // Normalize to [-π, π]
  if (diff > Math.PI) diff -= 2 * Math.PI;
  else if (diff < -Math.PI) diff += 2 * Math.PI;
  
  // Check against half FOV (converted to radians)
  const halfFov = fovDegrees * (Math.PI / 360);  // degrees/2 to radians
  return diff > -halfFov && diff < halfFov;
}
```

