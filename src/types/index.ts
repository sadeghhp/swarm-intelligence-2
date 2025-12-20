// ============================================================================
// Core Types
// ============================================================================

export interface IVector2 {
  x: number;
  y: number;
}

// ============================================================================
// Bird Types
// ============================================================================

export type Gender = 'male' | 'female';

export type FeedingState = 'none' | 'approaching' | 'gathering' | 'feeding';

export type MatingState = 
  | 'none' 
  | 'seeking' 
  | 'approaching' 
  | 'courting' 
  | 'mating' 
  | 'fighting' 
  | 'cooldown';

export interface IBirdState {
  id: number;
  speciesId: string;
  gender: Gender;
  position: IVector2;
  velocity: IVector2;
  acceleration: IVector2;
  heading: number;
  panicLevel: number;
  localDensity: number;
  energy: number;
  feedingState: FeedingState;
  targetFoodId: number;
  feedingTimer: number;
  matingState: MatingState;
  targetMateId: number;
  matingTimer: number;
  matingCooldown: number;
  aggressionLevel: number;
  // Firefly glow state
  glowPhase: number;
  naturalFrequency: number;
  glowIntensity: number;
}

// GPU Enum Mappings
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

// ============================================================================
// Configuration Types
// ============================================================================

export interface ISimulationConfig {
  birdCount: number;
  particleSize: number;
  maxSpeed: number;
  maxForce: number;
  perceptionRadius: number;
  separationRadius: number;
  alignmentWeight: number;
  cohesionWeight: number;
  separationWeight: number;
  fieldOfView: number;
  boundaryMargin: number;
  boundaryForce: number;
  /** Power for boundary force curve (2.0 = quadratic, higher = sharper response near edge) */
  boundaryCurvePower?: number;
  /** Look-ahead time multiplier for boundary anticipation (0.5 = half second at max speed) */
  boundaryLookAhead?: number;
  /** Wall damping factor: reduces flocking forces near walls (0.0-1.0, default 0.8) */
  wallDampingFactor?: number;
  /** Minimum escape speed as fraction of maxSpeed after wall collision (default 0.3) */
  minEscapeSpeed?: number;
  simulationSpeed: number;
  noiseStrength: number;
  wanderStrength: number;
  energyEnabled: boolean;
  energyDecayRate: number;
  minEnergySpeed: number;
  foodEnergyRestore: number;
}

// Day/Night Cycle Configuration
export interface IDayNightConfig {
  enabled: boolean;
  cycleDuration: number;    // seconds for full day/night cycle
  timeOfDay: number;        // 0-1 (0=midnight, 0.5=noon, 1=midnight)
  freezeTime: boolean;      // pause time progression
}

// Territory Configuration
export interface ITerritoryConfig {
  enabled: boolean;
  showZones: boolean;       // visualize territory boundaries
  defaultRadius: number;    // territory radius
  pullStrength: number;     // force pulling birds to home territory
}

// Multi-Species Ecosystem Configuration
export interface IEcosystemConfig {
  enabled: boolean;
  speciesCount: number;     // number of distinct species
  interactionRange: number; // range for inter-species interactions
  huntingForce: number;     // predator species attraction force
  fleeingForce: number;     // prey species fleeing force
}

export interface IEnvironmentConfig {
  windEnabled: boolean;
  windSpeed: number;
  windDirection: number;
  windTurbulence: number;
  predatorEnabled: boolean;
  predatorType: PredatorType;
  predatorCount: number;
  panicRadius: number;
  panicDecay: number;
  panicSpread: number;
  foodEnabled: boolean;
  foodCount: number;
  foodRadius: number;
  foodRespawnTime: number;
  foodAttractionRadius: number;
  maxFeedersPerFood: number;
  gatherRadius: number;
  feedingDuration: number;
  matingEnabled: boolean;
  mateSearchRadius: number;
  mateAttractionStrength: number;
  courtingDistance: number;
  matingDistance: number;
  matingDuration: number;
  matingCooldown: number;
  fightRadius: number;
  fightDuration: number;
  fightStrength: number;
  panicSuppressesMating: boolean;
  energyThresholdForMating: number;
  femaleSelectivity: number;
  // Firefly synchronization settings
  fireflyEnabled: boolean;
  fireflyBaseFrequency: number;      // Base flash frequency in Hz (default: 1.0)
  fireflyFrequencyVariation: number; // Random variation +/- (default: 0.2)
  fireflyCouplingStrength: number;   // How strongly neighbors influence phase (default: 0.5)
  fireflySyncRadius: number;         // Radius within which fireflies sync (default: perceptionRadius)
  fireflyFlashDuration: number;      // Duration of bright phase as fraction of cycle (default: 0.3)
  // Advanced features
  dayNight: IDayNightConfig;
  territories: ITerritoryConfig;
  ecosystem: IEcosystemConfig;
}

export interface IRenderingConfig {
  backgroundColor: number;
  particleColor: number;
  particleSize: number;
  particleShape: 'arrow' | 'circle' | 'triangle' | 'dot';
  antialias: boolean;
  colorMode: 'solid' | 'density' | 'speed' | 'panic' | 'gender' | 'mating' | 'firefly';
  lowDensityColor: number;
  highDensityColor: number;
  slowColor: number;
  fastColor: number;
  calmColor: number;
  panicColor: number;
  maleColor: number;
  femaleColor: number;
  trailEnabled: boolean;
  trailLength: number;
  trailColor: number;
  glowEnabled: boolean;
  glowIntensity: number;
  // Firefly glow colors
  fireflyDimColor: number;    // Color when firefly is dim (default: dark amber)
  fireflyGlowColor: number;   // Color when firefly is glowing (default: bright yellow-green)
  // Visual effects toggles
  motionBlurEnabled: boolean;
  showWindParticles: boolean;
  showPredatorRange: boolean;
  showFoodSources: boolean;
  showTerritories: boolean;
}

export interface ILoadedConfig {
  simulation: ISimulationConfig;
  environment: IEnvironmentConfig;
  rendering: IRenderingConfig;
  creaturePresets: Record<string, ICreaturePreset>;
  predatorPresets: Record<string, IPredatorPreset>;
}

// ============================================================================
// Preset Types
// ============================================================================

export type CreaturePresetRenderingOverrides = Partial<
  Pick<
    IRenderingConfig,
    | 'backgroundColor'
    | 'particleColor'
    | 'particleShape'
    | 'colorMode'
    | 'glowEnabled'
    | 'glowIntensity'
    | 'fireflyDimColor'
    | 'fireflyGlowColor'
    | 'lowDensityColor'
    | 'highDensityColor'
  >
>;

export type CreaturePresetEnvironmentOverrides = Partial<
  Pick<
    IEnvironmentConfig,
    | 'windEnabled'
    | 'windSpeed'
    | 'windDirection'
    | 'windTurbulence'
    | 'fireflyEnabled'
    | 'fireflyBaseFrequency'
    | 'fireflyFrequencyVariation'
    | 'fireflyCouplingStrength'
    | 'fireflySyncRadius'
    | 'fireflyFlashDuration'
    | 'dayNight'
  >
>;

export interface ICreaturePreset {
  name: string;
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
  birdColor?: number;
  description?: string;
  /**
   * Optional per-creature overrides for rendering settings.
   * Applied when selecting a creature preset (type change).
   */
  rendering?: CreaturePresetRenderingOverrides;
  /**
   * Optional per-creature overrides for environment settings.
   * Applied when selecting a creature preset (type change).
   */
  environment?: CreaturePresetEnvironmentOverrides;
}

export interface IPredatorPreset {
  name: string;
  maxSpeed: number;
  panicRadius: number;
  huntingStyle: 'edge' | 'stoop' | 'sustained' | 'ambush' | 'circling' | 'pack' | 'burst';
  color: number;
}

// ============================================================================
// Predator Types
// ============================================================================

export type PredatorType = 
  | 'hawk' 
  | 'falcon' 
  | 'eagle' 
  | 'owl'
  | 'shark' 
  | 'orca' 
  | 'barracuda' 
  | 'sea-lion';

export type PredatorBehaviorState = 
  | 'idle'
  | 'scanning'
  | 'stalking'
  | 'hunting'
  | 'attacking'
  | 'diving'
  | 'ambushing'
  | 'ascending'
  | 'circling'
  | 'herding'
  | 'recovering';

export interface IPredatorStats {
  maxEnergy: number;
  energyRegenRate: number;
  huntingDrain: number;
  attackCost: number;
  exhaustionThreshold: number;
  burstMultiplier: number;
  staminaRecoveryDelay: number;
}

export interface IPredatorState {
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

export interface ITargetScore {
  birdId: number;
  position: IVector2;
  isolationScore: number;
  edgeScore: number;
  velocityScore: number;
  panicScore: number;
  interceptScore: number;
  totalScore: number;
}

// ============================================================================
// Food Types
// ============================================================================

export interface IFoodSource {
  id: number;
  position: IVector2;
  amount: number;
  maxAmount: number;
  radius: number;
  respawnTimer: number;
  consumed: boolean;
  feeders: Set<number>;
  consumptionRate: number;
}

// ============================================================================
// Spatial Grid Types
// ============================================================================

export interface IGridCell {
  birdIds: number[];
}

// ============================================================================
// Attractor Types
// ============================================================================

export interface IAttractor {
  id: number;
  x: number;
  y: number;
  strength: number;
  radius: number;
  lifetime: number;
  isRepulsor: boolean;
}

// ============================================================================
// Statistics Types
// ============================================================================

export interface ISimulationStats {
  fps: number;
  birdCount: number;
  avgDensity: number;
  avgVelocity: number;
  avgEnergy: number;
  simulationTime: number;
  predatorState?: PredatorBehaviorState;
  predatorType?: PredatorType;
  predatorEnergy?: number;
  successfulHunts?: number;
  failedHunts?: number;
  activeFoodSources?: number;
  totalFoodConsumed?: number;
  feedingBirds?: number;
  matingPairs?: number;
  fightingPairs?: number;
  // Extended statistics
  activePredators?: number;
  maleCount?: number;
  femaleCount?: number;
  activeMatingPairs?: number;
  activeFights?: number;
  foodConsumed?: number;
  timeOfDay?: number;
}

// ============================================================================
// GPU Types
// ============================================================================

export interface IGPUCapabilities {
  available: boolean;
  adapter: string | null;
  reason?: string;
}

// ============================================================================
// Utility Types
// ============================================================================

export interface IPoolable {
  reset(): void;
  isActive: boolean;
}

// Callback Types
export type PresetChangeCallback = (presetKey: string) => void;
export type BirdCountChangeCallback = (count: number) => void;
export type PredatorToggleCallback = (enabled: boolean, type: PredatorType) => void;
export type FoodToggleCallback = (enabled: boolean) => void;
export type ConfigChangeCallback = () => void;
export type PerceptionRadiusChangeCallback = (radius: number) => void;
export type TrailsToggleCallback = (enabled: boolean) => void;
export type ColorChangeCallback = () => void;
export type DayNightToggleCallback = (enabled: boolean) => void;
export type TerritoryToggleCallback = (enabled: boolean) => void;
export type EcosystemToggleCallback = (enabled: boolean) => void;
export type PauseResumeCallback = (paused: boolean) => void;
export type ResetCallback = () => void;
export type PredatorTypeChangeCallback = (type: PredatorType) => void;
export type PredatorCountChangeCallback = (count: number) => void;


