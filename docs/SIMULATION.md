# Simulation Engine & Boids Algorithm

This document details the core simulation engine and the implementation of Reynolds' Boids algorithm in the Swarm Intelligence Simulator.

## Core Physics

The simulation uses a **Fixed Timestep Physics** model to ensure consistent behavior across different hardware and frame rates.

### Fixed Timestep Accumulator
The physics updates at a constant 60Hz, while rendering occurs as fast as possible. If the frame rate drops, the simulation performs multiple physics steps to catch up, preventing instability.

```typescript
private readonly fixedDeltaTime: number = 1 / 60;
private accumulator: number = 0;

update(deltaTime: number): void {
  this.accumulator += deltaTime * config.simulationSpeed;
  while (this.accumulator >= this.fixedDeltaTime) {
    this.fixedUpdate(this.fixedDeltaTime);
    this.accumulator -= this.fixedDeltaTime;
  }
}
```

### Integration
Each agent (Bird) uses basic Euler integration for movement:
1. `velocity += acceleration * deltaTime`
2. `velocity.limit(maxSpeed)`
3. `position += velocity * deltaTime`
4. `acceleration.zero()`

## Reynolds' Boids Rules

The swarm's emergent behavior arises from three simple rules applied to each bird based on its local neighbors.

### 1. Alignment (Steer towards average heading)
Birds try to match the velocity of their neighbors.
- **Goal**: Group synchronization.
- **Formula**: `steering = normalize(avg_neighbor_velocity) * maxSpeed - current_velocity`

### 2. Cohesion (Steer towards average position)
Birds try to move towards the center of mass of their neighbors.
- **Goal**: Group staying together.
- **Formula**: `desired = avg_neighbor_position - current_position; steering = normalize(desired) * maxSpeed - current_velocity`

### 3. Separation (Avoid crowding neighbors)
Birds steer away from neighbors that are too close.
- **Goal**: Avoid collisions.
- **Formula**: `force = (current_position - neighbor_position) / distance^2; steering = normalize(avg_force) * maxSpeed - current_velocity`

## Environmental Forces

Beyond internal swarm rules, several external forces affect movement:

- **Boundary Avoidance**: A soft force field that pushes birds away from the screen edges.
- **Wind**: A global force with Perlin noise turbulence that affects all birds.
- **Attractors/Repulsors**: Interactive points that pull or push birds within a specific radius.
- **Panic Response**: A high-priority flee force triggered when a predator is nearby, which also propagates to neighbors.

## Field of View (Vision)
Birds do not have 360° vision by default. Their perception is limited to a vision cone (FOV). Neighbors outside this cone are ignored for Alignment and Cohesion, though they may still trigger Separation to prevent collisions from behind.

## Spatial Grid Optimization
To avoid O(n²) complexity, the simulation uses a **Spatial Grid**. The world is divided into cells, and each bird is binned into a cell every frame. Neighbor lookups only check the bird's current and adjacent cells, dramatically increasing performance for large populations.
