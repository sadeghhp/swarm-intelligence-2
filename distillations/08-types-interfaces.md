# Types and Interfaces

## Complete TypeScript Type Definitions

This document provides a comprehensive reference of all TypeScript interfaces, types, and enums used throughout the simulation.

---

## Core Types

### IVector2

```typescript
interface IVector2 {
  x: number;
  y: number;
}
```

---

## Bird Types

### Gender

```typescript
type Gender = 'male' | 'female';
```

### FeedingState

```typescript
type FeedingState = 'none' | 'approaching' | 'gathering' | 'feeding';
```

### MatingState

```typescript
type MatingState = 
  | 'none' 
  | 'seeking' 
  | 'approaching' 
  | 'courting' 
  | 'mating' 
  | 'fighting' 
  | 'cooldown';
```

### IBirdState

Complete bird state for serialization or external access:

```typescript
interface IBirdState {
  // Identity
  id: number;
  speciesId: string;
  gender: Gender;
  
  // Physics
  position: IVector2;
  velocity: IVector2;
  acceleration: IVector2;
  heading: number;
  
  // Behavioral state
  panicLevel: number;        // 0-1
  localDensity: number;      // Count of nearby neighbors
  energy: number;            // 0-1
  
  // Feeding
  feedingState: FeedingState;
  targetFoodId: number;
  feedingTimer: number;
  
  // Mating
  matingState: MatingState;
  targetMateId: number;
  matingTimer: number;
  matingCooldown: number;
  aggressionLevel: number;   // 0-1, males only
}
```

### GPU Enum Mappings

```typescript
// For converting string enums to integers for GPU buffers
export const FeedingStateMap: Record<FeedingState, number> = {
  'none': 0,
  'approaching': 1,
  'gathering': 2,
  'feeding': 3
};

export const MatingStateMap: Record<MatingState, number> = {
  'none': 0,
  'seeking': 1,
  'approaching': 2,
  'courting': 3,
  'mating': 4,
  'fighting': 5,
  'cooldown': 6
};

export const GenderMap: Record<Gender, number> = {
  'female': 0,
  'male': 1
};

// Reverse mappings for GPU readback
export const ReverseFeedingStateMap: Record<number, FeedingState> = {
  0: 'none',
  1: 'approaching',
  2: 'gathering',
  3: 'feeding'
};

export const ReverseMatingStateMap: Record<number, MatingState> = {
  0: 'none',
  1: 'seeking',
  2: 'approaching',
  3: 'courting',
  4: 'mating',
  5: 'fighting',
  6: 'cooldown'
};

export const ReverseGenderMap: Record<number, Gender> = {
  0: 'female',
  1: 'male'
};
```

---

## Configuration Types

### ISimulationConfig

```typescript
interface ISimulationConfig {
  // Population
  birdCount: number;              // Number of birds in simulation
  particleSize: number;           // Visual size multiplier
  
  // Physics
  maxSpeed: number;               // Maximum velocity magnitude
  maxForce: number;               // Maximum steering force
  
  // Perception
  perceptionRadius: number;       // Range for neighbor detection
  separationRadius: number;       // Range for separation rule
  fieldOfView: number;            // Vision cone in degrees (0-360)
  
  // Boids rule weights
  alignmentWeight: number;        // Alignment force multiplier
  cohesionWeight: number;         // Cohesion force multiplier
  separationWeight: number;       // Separation force multiplier
  
  // Boundary handling
  boundaryMargin: number;         // Distance from edge to start avoidance
  boundaryForce: number;          // Strength of edge avoidance
  
  // Timing
  simulationSpeed: number;        // Time multiplier (1.0 = real-time)
  
  // Behavior variation
  noiseStrength: number;          // Perlin noise influence
  wanderStrength: number;         // Random wandering force
  
  // Energy system
  energyEnabled: boolean;         // Toggle energy mechanics
  energyDecayRate: number;        // Energy drain per second
  minEnergySpeed: number;         // Speed at zero energy (0-1)
  foodEnergyRestore: number;      // Energy restored per second when feeding
}
```

### IEnvironmentConfig

```typescript
interface IEnvironmentConfig {
  // Wind system
  windEnabled: boolean;
  windSpeed: number;              // 0-2, affects force magnitude
  windDirection: number;          // Degrees (0 = right, 90 = down)
  windTurbulence: number;         // 0-1, random variation
  
  // Predator system
  predatorEnabled: boolean;
  predatorType: PredatorType;
  panicRadius: number;            // Distance to trigger panic
  panicDecay: number;             // How fast panic fades
  panicSpread: number;            // How much panic spreads to neighbors
  
  // Food system
  foodEnabled: boolean;
  foodCount: number;              // Number of food sources
  foodRadius: number;             // Visual/interaction radius
  foodRespawnTime: number;        // Seconds until respawn
  foodAttractionRadius: number;   // Detection range
  maxFeedersPerFood: number;      // Maximum birds per source
  gatherRadius: number;           // Orbit distance when gathering
  feedingDuration: number;        // Minimum feeding time (seconds)
  
  // Mating system
  matingEnabled: boolean;
  mateSearchRadius: number;       // Detection range
  mateAttractionStrength: number; // Force multiplier
  courtingDistance: number;       // Distance to start courting
  matingDistance: number;         // Distance to lock into mating
  matingDuration: number;         // Pair duration (seconds)
  matingCooldown: number;         // Recovery time (seconds)
  fightRadius: number;            // Male competition range
  fightDuration: number;          // Contest length (seconds)
  fightStrength: number;          // Repulsion force multiplier
  panicSuppressesMating: boolean; // High panic disables mating
  energyThresholdForMating: number; // Minimum energy to seek mate
  femaleSelectivity: number;      // 0-1, rejection probability
}
```

### IRenderingConfig

```typescript
interface IRenderingConfig {
  // Base appearance
  backgroundColor: number;        // 0xRRGGBB format
  particleColor: number;          // Default particle color
  particleShape: 'arrow' | 'circle' | 'triangle' | 'dot';
  antialias: boolean;
  
  // Color mode
  colorMode: 'solid' | 'density' | 'speed' | 'panic' | 'gender' | 'mating';
  
  // Gradient colors
  lowDensityColor: number;        // Color at low neighbor count
  highDensityColor: number;       // Color at high neighbor count
  slowColor: number;              // Color at low speed
  fastColor: number;              // Color at high speed
  calmColor: number;              // Color at zero panic
  panicColor: number;             // Color at full panic
  maleColor: number;              // Color for male birds
  femaleColor: number;            // Color for female birds
  
  // Effects
  trailEnabled: boolean;
  trailLength: number;            // Number of trail points
  trailColor: number;
  glowEnabled: boolean;
  glowIntensity: number;          // 0-1
}
```

### ILoadedConfig

Combined configuration loaded from JSON:

```typescript
interface ILoadedConfig {
  simulation: ISimulationConfig;
  environment: IEnvironmentConfig;
  rendering: IRenderingConfig;
  creaturePresets: Record<string, ICreaturePreset>;
  predatorPresets: Record<string, IPredatorPreset>;
}
```

---

## Preset Types

### ICreaturePreset

```typescript
interface ICreaturePreset {
  name: string;                   // Display name
  birdCount: number;
  maxSpeed: number;
  maxForce: number;
  perceptionRadius: number;
  separationRadius: number;
  alignmentWeight: number;
  cohesionWeight: number;
  separationWeight: number;
  fieldOfView: number;
  particleSize: number;
}

// Alternative using Partial<ISimulationConfig>
type CreaturePreset = Pick<ISimulationConfig, 
  | 'birdCount' 
  | 'maxSpeed' 
  | 'maxForce' 
  | 'perceptionRadius'
  | 'separationRadius'
  | 'alignmentWeight'
  | 'cohesionWeight'
  | 'separationWeight'
  | 'fieldOfView'
  | 'particleSize'
> & { name: string };
```

### IPredatorPreset

```typescript
interface IPredatorPreset {
  name: string;
  maxSpeed: number;
  panicRadius: number;
  huntingStyle: 'edge' | 'stoop' | 'sustained' | 'ambush' | 'pack' | 'burst';
  color: number;                  // 0xRRGGBB
}
```

---

## Predator Types

### PredatorType

```typescript
type PredatorType = 
  | 'hawk' 
  | 'falcon' 
  | 'eagle' 
  | 'owl'
  | 'shark' 
  | 'orca' 
  | 'barracuda' 
  | 'sea-lion';
```

### PredatorBehaviorState

```typescript
type PredatorBehaviorState = 
  | 'idle'       // Resting, not hunting
  | 'scanning'   // Looking for targets
  | 'stalking'   // Tracking target from distance
  | 'hunting'    // Active pursuit
  | 'attacking'  // Final strike
  | 'diving'     // Falcon-specific high-speed dive
  | 'ambushing'  // Owl-specific hidden wait
  | 'recovering'; // Post-hunt energy recovery
```

### IPredatorStats

```typescript
interface IPredatorStats {
  maxEnergy: number;              // Maximum energy capacity
  energyRegenRate: number;        // Energy per second while idle
  huntingDrain: number;           // Energy drain per second while hunting
  attackCost: number;             // One-time energy cost per attack
  exhaustionThreshold: number;    // Energy level requiring rest
  burstMultiplier: number;        // Speed multiplier during attack
  staminaRecoveryDelay: number;   // Seconds before regen starts
}
```

### IPredatorState

External state representation:

```typescript
interface IPredatorState {
  id: number;
  type: PredatorType;
  position: IVector2;
  velocity: IVector2;
  state: PredatorBehaviorState;
  energy: number;
  target: IVector2 | null;
  panicRadius: number;
  successfulHunts: number;
  failedHunts: number;
}
```

### ITargetScore

Target evaluation result:

```typescript
interface ITargetScore {
  birdId: number;
  position: IVector2;
  isolationScore: number;         // How isolated from flock
  edgeScore: number;              // Distance from flock center
  velocityScore: number;          // Moving away from flock
  panicScore: number;             // Already panicked
  interceptScore: number;         // Can predator reach it
  totalScore: number;             // Weighted sum
}
```

---

## Food Types

### IFoodSource

```typescript
interface IFoodSource {
  id: number;
  position: IVector2;
  amount: number;                 // Current food remaining
  maxAmount: number;              // Maximum capacity
  radius: number;                 // Visual/interaction radius
  respawnTimer: number;           // Time until respawn (when consumed)
  consumed: boolean;              // Is depleted
  feeders: Set<number>;           // Bird IDs currently feeding
  consumptionRate: number;        // Rate based on feeder count
}
```

---

## Spatial Grid Types

### IGridCell

```typescript
interface IGridCell {
  birdIds: number[];              // Birds in this cell
}
```

### INeighborResult

```typescript
interface INeighborResult {
  neighbors: Bird[];              // Array of neighbor birds
  count: number;                  // Actual count (may differ from array length)
}
```

---

## Attractor Types

### IAttractor

```typescript
interface IAttractor {
  id: number;
  x: number;
  y: number;
  strength: number;               // Force magnitude
  radius: number;                 // Effect radius
  lifetime: number;               // Remaining time (seconds)
  isRepulsor: boolean;            // True = push away, false = pull in
}
```

---

## Statistics Types

### ISimulationStats

```typescript
interface ISimulationStats {
  fps: number;
  birdCount: number;
  avgDensity: number;             // Average neighbors per bird
  avgVelocity: number;            // Average speed
  avgEnergy: number;              // Average energy (if enabled)
  simulationTime: number;         // Total simulation time
  
  // Predator stats
  predatorState?: PredatorBehaviorState;
  predatorEnergy?: number;
  successfulHunts?: number;
  failedHunts?: number;
  
  // Food stats
  activeFoodSources?: number;
  totalFoodConsumed?: number;
  feedingBirds?: number;
  
  // Mating stats
  matingPairs?: number;
  fightingPairs?: number;
}
```

---

## GPU Types

### IGPUCapabilities

```typescript
interface IGPUCapabilities {
  available: boolean;
  adapter: string | null;         // GPU adapter description
  reason?: string;                // Error message if unavailable
}
```

### Buffer Layouts

```typescript
// Position buffer layout (per bird)
interface IPositionBuffer {
  x: number;  // Float32, offset 0
  y: number;  // Float32, offset 4
}
// Total: 8 bytes per bird

// Velocity buffer layout (per bird)
interface IVelocityBuffer {
  vx: number; // Float32, offset 0
  vy: number; // Float32, offset 4
}
// Total: 8 bytes per bird

// State buffer layout (per bird)
interface IStateBuffer {
  panicLevel: number;     // Float32, offset 0
  energy: number;         // Float32, offset 4
  feedingState: number;   // Float32, offset 8 (enum as float)
  matingState: number;    // Float32, offset 12 (enum as float)
  localDensity: number;   // Float32, offset 16
  heading: number;        // Float32, offset 20
  gender: number;         // Float32, offset 24 (enum as float)
  targetId: number;       // Float32, offset 28
}
// Total: 32 bytes per bird

// Config uniform layout
interface IConfigUniform {
  birdCount: number;      // Float32, index 0
  width: number;          // Float32, index 1
  height: number;         // Float32, index 2
  deltaTime: number;      // Float32, index 3
  maxSpeed: number;       // Float32, index 4
  maxForce: number;       // Float32, index 5
  perceptionRadius: number;   // Float32, index 6
  separationRadius: number;   // Float32, index 7
  alignmentWeight: number;    // Float32, index 8
  cohesionWeight: number;     // Float32, index 9
  separationWeight: number;   // Float32, index 10
  fieldOfView: number;        // Float32, index 11 (radians)
  boundaryMargin: number;     // Float32, index 12
  boundaryForce: number;      // Float32, index 13
  simulationSpeed: number;    // Float32, index 14
  energyEnabled: number;      // Float32, index 15 (0 or 1)
  // ... indices 16-31 for environment config
  // ... indices 32-47 for additional params
  // ... indices 48-63 reserved
}
// Total: 256 bytes (64 floats)
```

---

## Utility Types

### IPoolable

For object pooling:

```typescript
interface IPoolable {
  reset(): void;                  // Reset to initial state
  isActive: boolean;              // Currently in use
}
```

### Callback Types

```typescript
// UI callbacks
type PresetChangeCallback = (presetKey: string) => void;
type BirdCountChangeCallback = (count: number) => void;
type PredatorToggleCallback = (enabled: boolean, type: PredatorType) => void;
type FoodToggleCallback = (enabled: boolean) => void;
type ConfigChangeCallback = () => void;

// Simulation callbacks
type SimulationStepCallback = (deltaTime: number) => void;
type RenderCallback = () => void;
```

---

## Type Guards

```typescript
function isFeedingState(value: unknown): value is FeedingState {
  return typeof value === 'string' && 
    ['none', 'approaching', 'gathering', 'feeding'].includes(value);
}

function isMatingState(value: unknown): value is MatingState {
  return typeof value === 'string' && 
    ['none', 'seeking', 'approaching', 'courting', 'mating', 'fighting', 'cooldown'].includes(value);
}

function isGender(value: unknown): value is Gender {
  return value === 'male' || value === 'female';
}

function isPredatorType(value: unknown): value is PredatorType {
  return typeof value === 'string' && 
    ['hawk', 'falcon', 'eagle', 'owl', 'shark', 'orca', 'barracuda', 'sea-lion'].includes(value);
}

function isPredatorBehaviorState(value: unknown): value is PredatorBehaviorState {
  return typeof value === 'string' && 
    ['idle', 'scanning', 'stalking', 'hunting', 'attacking', 'diving', 'ambushing', 'recovering'].includes(value);
}
```

---

## Module Exports

### From `src/types/index.ts`

```typescript
// Re-export all types
export type {
  IVector2,
  Gender,
  FeedingState,
  MatingState,
  IBirdState,
  ISimulationConfig,
  IEnvironmentConfig,
  IRenderingConfig,
  ILoadedConfig,
  ICreaturePreset,
  CreaturePreset,
  IPredatorPreset,
  PredatorType,
  PredatorBehaviorState,
  IPredatorStats,
  IPredatorState,
  ITargetScore,
  IFoodSource,
  IGridCell,
  INeighborResult,
  IAttractor,
  ISimulationStats,
  IGPUCapabilities,
  IPoolable
};

// Re-export enum maps
export {
  FeedingStateMap,
  MatingStateMap,
  GenderMap,
  ReverseFeedingStateMap,
  ReverseMatingStateMap,
  ReverseGenderMap
};

// Re-export config utilities
export { loadConfig, setConfig, getConfig } from '../config/ConfigLoader';
```
