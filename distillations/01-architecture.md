# Architecture Overview

## Project Structure

```
src/
├── main.ts                 # Application entry point
├── App.ts                  # Main orchestrator class
├── types/
│   └── index.ts           # TypeScript interfaces and types
├── config/
│   ├── ConfigLoader.ts    # JSON config loading and parsing
│   └── PresetManager.ts   # Custom preset save/load (localStorage)
├── simulation/
│   ├── Bird.ts            # Bird entity and BirdArrays (SoA)
│   ├── Flock.ts           # Flock manager - simulation orchestration
│   ├── SwarmRules.ts      # Reynolds' Boids algorithm implementation
│   ├── SpatialGrid.ts     # Spatial partitioning for neighbor lookup
│   ├── Ecosystem.ts       # Multi-species interaction system
│   ├── Territory.ts       # Territory zone management
│   └── gpu/
│       ├── index.ts       # GPU module exports
│       └── GPUSimulationRunner.ts  # WebGPU compute pipeline
├── environment/
│   ├── Attractor.ts       # Attractor/repulsor force sources
│   ├── DayNightCycle.ts   # Time-of-day lighting system
│   ├── FoodSource.ts      # Food source manager
│   ├── Wind.ts            # Wind force system
│   ├── Predator.ts        # Legacy predator (deprecated)
│   └── predators/
│       ├── index.ts       # Predator exports
│       ├── BasePredator.ts    # Abstract predator base class
│       ├── PredatorFactory.ts # Factory for creating predators
│       ├── HawkPredator.ts    # Edge-hunting specialist
│       ├── FalconPredator.ts  # Stoop-diving predator
│       ├── EaglePredator.ts   # Sustained pursuit predator
│       ├── OwlPredator.ts     # Ambush predator
│       ├── SharkPredator.ts   # Ocean circling predator
│       ├── OrcaPredator.ts    # Pack coordination predator
│       ├── BarracudaPredator.ts # Ambush burst striker
│       └── SeaLionPredator.ts   # Agile pursuit predator
├── rendering/
│   ├── FlockRenderer.ts       # Particle sprite rendering
│   ├── EnvironmentRenderer.ts # Wind, predators, food visuals
│   └── TrailEffect.ts         # Motion trail effects
├── ui/
│   ├── ControlPanel.ts    # Tweakpane UI integration
│   └── Statistics.ts      # Real-time statistics display
└── utils/
    ├── Vector2.ts         # 2D vector math class
    ├── MathUtils.ts       # Math utilities (noise, interpolation)
    └── ObjectPool.ts      # Generic object pooling
```

## Module Dependency Graph

```
┌─────────────────────────────────────────────────────────────────────┐
│                           main.ts                                    │
│                    (Entry Point + Config Loading)                    │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                            App.ts                                    │
│                    (Main Orchestrator Class)                         │
│  - Initializes flux-gpu renderer                                      │
│  - Creates and manages all subsystems                                │
│  - Handles main game loop                                            │
│  - Coordinates user input                                            │
└────────┬──────────┬──────────┬──────────┬──────────┬───────────────┘
         │          │          │          │          │
         ▼          ▼          ▼          ▼          ▼
┌─────────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────┐
│   Flock     │ │Predators│ │  Food   │ │Renderers│ │ControlPanel │
│ (Simulation)│ │  (AI)   │ │ Manager │ │(flux-gpu)│ │ (Tweakpane) │
└──────┬──────┘ └────┬────┘ └────┬────┘ └────┬────┘ └──────┬──────┘
       │             │           │           │             │
       ▼             │           │           │             │
┌──────────────┐     │           │           │             │
│  SwarmRules  │     │           │           │             │
│ (Boids Algo) │     │           │           │             │
└──────┬───────┘     │           │           │             │
       │             │           │           │             │
       ▼             │           │           │             │
┌──────────────┐     │           │           │             │
│ SpatialGrid  │     │           │           │             │
│(Optimization)│     │           │           │             │
└──────────────┘     │           │           │             │
                     │           │           │             │
                     └───────────┴───────────┴─────────────┘
                                 │
                                 ▼
                    ┌───────────────────────┐
                    │    Config System      │
                    │  (JSON + localStorage)│
                    └───────────────────────┘
```

## Data Flow

### Initialization Flow

```
1. main.ts: DOMContentLoaded event
   │
   ├─► loadConfig('/config.json')
   │   └─► Parse JSON, convert hex colors to numbers
   │
   ├─► setConfig(config)
   │   └─► Store in module-level variable
   │
   └─► new App() + app.initialize()
       │
       ├─► Initialize flux-gpu context
       │   └─► Canvas, WebGPU device, pipelines
       │
       ├─► Create Flock instance
       │   ├─► Initialize SpatialGrid
       │   ├─► Initialize SwarmRules
       │   └─► Create initial Bird array
       │
       ├─► Create Predators via PredatorFactory
       │
       ├─► Create FoodSourceManager
       │
       ├─► Create Renderers
       │   ├─► FlockRenderer (particle sprites)
       │   ├─► EnvironmentRenderer (wind, predators, food)
       │   └─► TrailEffect
       │
       ├─► Create ControlPanel (Tweakpane)
       │
       └─► Create Statistics display
```

### Frame Update Flow (Game Loop)

```
gameLoop() [requestAnimationFrame]
│
├─► Calculate deltaTime (clamped to 0.1s max)
│
├─► syncConfigs()
│   └─► Copy ControlPanel values to Flock.config
│
├─► update(deltaTime)
│   │
│   ├─► Update Predators (if enabled)
│   │   ├─► Calculate flock center
│   │   ├─► predator.update(deltaTime, envConfig, birds, flockCenter)
│   │   ├─► Set predator position for panic response
│   │   └─► Apply panic to nearby birds
│   │
│   ├─► Update Food Sources (if enabled)
│   │   ├─► foodManager.update(deltaTime, envConfig)
│   │   └─► Apply food attraction forces to birds
│   │
│   ├─► flock.update(deltaTime)
│   │   │
│   │   ├─► Accumulate time for fixed timestep
│   │   │
│   │   └─► fixedUpdate() [per fixed timestep]
│   │       │
│   │       ├─► Rebuild SpatialGrid
│   │       │   ├─► spatialGrid.clear()
│   │       │   └─► spatialGrid.insertAll(birds)
│   │       │
│   │       └─► For each bird:
│   │           ├─► Update feeding state machine
│   │           ├─► Get neighbors from SpatialGrid
│   │           ├─► Calculate swarm forces (SwarmRules)
│   │           │   ├─► Alignment
│   │           │   ├─► Cohesion
│   │           │   └─► Separation
│   │           ├─► Apply environmental forces
│   │           │   ├─► Wind
│   │           │   ├─► Attractors
│   │           │   └─► Food attraction
│   │           ├─► Apply panic response (if predator nearby)
│   │           ├─► Apply mating behavior forces
│   │           ├─► Apply boundary avoidance
│   │           └─► bird.update() - physics integration
│   │
│   └─► trailEffect.update(birds, deltaTime)
│
├─► render()
│   │
│   ├─► flockRenderer.update(birds, simConfig)
│   │   └─► Update sprite positions, rotations, colors
│   │
│   └─► envRenderer.update(deltaTime, envConfig, predatorStates, attractors, foodSources)
│       ├─► Wind particles
│       ├─► Predator visuals
│       ├─► Food source visuals
│       └─► Attractor visuals
│
└─► updateStatistics()
    ├─► Calculate averages (density, velocity, energy)
    └─► Update DOM elements
```

## Key Classes and Their Responsibilities

### App (Main Orchestrator)
- **File**: `src/App.ts`
- **Purpose**: Central hub coordinating all subsystems
- **Key Methods**:
  - `initialize()`: Setup flux-gpu, create all subsystems
  - `start()`: Begin game loop
  - `gameLoop()`: Main update/render cycle
  - `syncConfigs()`: Sync UI values to simulation
  - `handleClick/handleRightClick`: User interactions

### Flock (Simulation Manager)
- **File**: `src/simulation/Flock.ts`
- **Purpose**: Manages bird collection and simulation update
- **Key Methods**:
  - `update(deltaTime)`: Main simulation update with fixed timestep
  - `fixedUpdate(dt)`: Per-frame physics calculations
  - `updateFeedingState(bird)`: Feeding state machine
  - `updateMatingBehavior(bird)`: Mating state machine
  - `addAttractor()`: Add click-based attractors

### SwarmRules (Algorithm Engine)
- **File**: `src/simulation/SwarmRules.ts`
- **Purpose**: Implements Reynolds' Boids flocking rules
- **Key Methods**:
  - `calculate()`: Compute all steering forces
  - `calculateAlignment()`: Match neighbor velocities
  - `calculateCohesion()`: Move toward local center
  - `calculateSeparation()`: Avoid crowding
  - `calculatePanicResponse()`: Flee from predators

### SpatialGrid (Optimization)
- **File**: `src/simulation/SpatialGrid.ts`
- **Purpose**: O(n*k) neighbor lookup instead of O(n²)
- **Key Methods**:
  - `insertAll(birds)`: Rebuild grid each frame
  - `getNeighbors(bird, birds, radius, fov)`: Fast neighbor query

## Fixed Timestep Physics

The simulation uses a fixed timestep accumulator pattern:

```typescript
private readonly fixedDeltaTime: number = 1 / 60;  // 60 Hz physics
private accumulator: number = 0;

update(deltaTime: number): void {
  deltaTime = Math.min(deltaTime, 0.1);  // Prevent spiral of death
  this.accumulator += deltaTime * config.simulationSpeed;
  
  while (this.accumulator >= this.fixedDeltaTime) {
    this.fixedUpdate(this.fixedDeltaTime);
    this.accumulator -= this.fixedDeltaTime;
    this.simulationTime += this.fixedDeltaTime;
  }
}
```

**Benefits**:
- Consistent physics regardless of frame rate
- Deterministic behavior across different machines
- Prevents instability from large timesteps

## Memory Allocation Strategy

The project prioritizes zero-allocation in hot loops:

1. **Pre-allocated Vectors**: Temporary vectors declared at module scope
   ```typescript
   const tempSwarmForce = new Vector2();
   const tempPanicForce = new Vector2();
   // ... used in calculate() methods
   ```

2. **Output Parameters**: Functions write to provided vectors
   ```typescript
   calculatePanicResponse(bird, predatorPos, radius, force, outForce: Vector2): void
   ```

3. **Reusable Buffers**: SpatialGrid uses internal buffers
   ```typescript
   private candidateBuffer: number[] = new Array(500);
   private neighborBuffer: Bird[] = new Array(100);
   ```

4. **Object Pooling**: Available via `ObjectPool<T>` utility
   ```typescript
   export const vectorPool = new ObjectPool<Vector2Poolable>(() => new Vector2Poolable(), 500);
   ```

## Configuration Hierarchy

```
config.json (loaded at startup)
    │
    ├─► ISimulationConfig (bird behavior)
    │   └─► birdCount, maxSpeed, perceptionRadius, weights...
    │
    ├─► IEnvironmentConfig (world settings)
    │   └─► wind, predator, food, mating settings...
    │
    ├─► IRenderingConfig (visual settings)
    │   └─► colors, shapes, trails, glow...
    │
    └─► CreaturePresets (12 preset configurations)
        └─► starlings, insects, fish, bats, fireflies, ants...

                    ▼ Runtime modifications via ControlPanel
                    
ControlPanel (Tweakpane)
    │
    └─► Updates config objects in-place
        └─► synced to Flock each frame via syncConfigs()
```

## Event Handling

```typescript
// Canvas click handlers
canvas.addEventListener('click', (e) => {
  if (e.shiftKey && foodEnabled) {
    foodManager.spawnFood(x, y, radius);
  } else {
    flock.addAttractor(x, y, strength, radius, lifetime, isRepulsor: false);
  }
});

canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  flock.addAttractor(x, y, strength, radius, lifetime, isRepulsor: true);
});

// Window resize
window.addEventListener('resize', () => {
  app.renderer.resize(width, height);
  flock.resize(width, height);
  envRenderer.resize(width, height);
  predators.forEach(p => p.resize(width, height));
  foodManager.resize(width, height);
});
```
