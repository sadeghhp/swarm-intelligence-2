import { Vector2 } from '../utils/Vector2';
import type {
  IVector2,
  ISimulationConfig,
  Gender,
  FeedingState,
  MatingState
} from '../types';

// Pre-allocated temporary vectors for boundary calculations
const tempBoundary = new Vector2();
const tempDesired = new Vector2();

// Smoothstep function for smooth force falloff
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Bird entity representing a single agent in the swarm.
 */
export class Bird {
  // Identity
  readonly id: number;
  speciesId: string = 'default';
  gender: Gender;

  // Physics state
  position: Vector2;
  velocity: Vector2;
  acceleration: Vector2;

  // Behavioral state
  panicLevel: number = 0;
  localDensity: number = 0;
  energy: number = 1.0;

  // Feeding state
  feedingState: FeedingState = 'none';
  targetFoodId: number = -1;
  feedingTimer: number = 0;

  // Mating state
  matingState: MatingState = 'none';
  targetMateId: number = -1;
  matingTimer: number = 0;
  matingCooldown: number = 0;
  aggressionLevel: number;

  // Firefly glow state (Kuramoto synchronization)
  glowPhase: number = 0;           // Current phase in flash cycle (0 to 2π)
  naturalFrequency: number = 1.0;  // Individual natural flashing frequency (Hz)
  glowIntensity: number = 0;       // Current glow brightness (0 to 1, computed from phase)

  // Cached values
  private _heading: number = 0;

  constructor(id: number, x: number, y: number) {
    this.id = id;
    this.position = new Vector2(x, y);
    this.velocity = Vector2.random().mult(5);
    this.acceleration = new Vector2();

    // 50/50 gender assignment
    this.gender = Math.random() < 0.5 ? 'male' : 'female';

    // Males have aggression for fighting
    this.aggressionLevel = this.gender === 'male' ? 0.5 + Math.random() * 0.5 : 0;

    // Firefly glow: random initial phase and slight frequency variation
    this.glowPhase = Math.random() * Math.PI * 2;
    this.naturalFrequency = 0.8 + Math.random() * 0.4; // 0.8 to 1.2 Hz variation
    this.glowIntensity = Math.sin(this.glowPhase) ** 2; // Initial intensity from phase

    // Initial heading from velocity
    this._heading = this.velocity.heading();
  }

  // ============================================================================
  // Physics
  // ============================================================================

  get heading(): number {
    return this._heading;
  }

  get speed(): number {
    return this.velocity.mag();
  }

  applyForce(force: IVector2): void {
    this.acceleration.x += force.x;
    this.acceleration.y += force.y;
  }

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
    effectiveMaxSpeed *= 1 + this.panicLevel * 0.5;

    // 3. Limit velocity magnitude
    this.velocity.limit(effectiveMaxSpeed);

    // 4. Apply velocity to position
    const velMult = deltaTime * config.simulationSpeed;
    this.position.x += this.velocity.x * velMult;
    this.position.y += this.velocity.y * velMult;

    // 5. Cache heading for rendering (avoid if velocity near zero)
    const velMagSq = this.velocity.magSq();
    if (velMagSq > 0.01) {
      this._heading = Math.atan2(this.velocity.y, this.velocity.x);
    }

    // 6. Clear acceleration for next frame
    this.acceleration.zero();

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

  // ============================================================================
  // Boundary Handling
  // Version: 2.0.0 - Smooth steering-based boundary avoidance with look-ahead
  // ============================================================================

  /**
   * Apply smooth boundary avoidance force using steering behavior.
   * Features:
   * - Look-ahead anticipation based on current velocity
   * - Smooth non-linear force curve (quadratic falloff)
   * - Steering-based force for natural curved trajectories
   * 
   * @param width - World width
   * @param height - World height
   * @param margin - Distance from edge where force begins
   * @param force - Base force strength
   * @param maxSpeed - Maximum speed for steering calculation
   * @param maxForce - Maximum steering force limit
   */
  applyBoundaryForce(
    width: number,
    height: number,
    margin: number,
    force: number,
    maxSpeed: number = 15,
    maxForce: number = 0.5
  ): void {
    tempBoundary.zero();

    // Current position
    const x = this.position.x;
    const y = this.position.y;

    // Calculate current speed for look-ahead
    const speed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.y * this.velocity.y);
    
    // Look-ahead time scales with speed (faster = look further ahead)
    // Default 0.5 units at max speed, configurable via boundaryLookAhead
    const lookAheadMultiplier = 0.5; // Default, can be overridden
    const lookAheadTime = speed > 0.1 ? lookAheadMultiplier * (speed / maxSpeed) : 0;
    
    // Calculate future position based on current velocity
    const futureX = x + this.velocity.x * lookAheadTime;
    const futureY = y + this.velocity.y * lookAheadTime;

    // Calculate distances to boundaries (use both current and future positions)
    // Use the closer one to ensure we react in time
    const distLeft = Math.min(x, futureX);
    const distRight = Math.min(width - x, width - futureX);
    const distTop = Math.min(y, futureY);
    const distBottom = Math.min(height - y, height - futureY);

    // Force curve power (quadratic for smooth acceleration near boundaries)
    const power = 2.0;

    // Calculate boundary force for each edge using smooth curve
    // Left edge
    if (distLeft < margin && distLeft > 0) {
      const t = 1 - distLeft / margin; // 0 at margin, 1 at edge
      const smoothT = smoothstep(0, 1, t); // Smooth the transition
      tempBoundary.x += force * Math.pow(smoothT, power);
    } else if (distLeft <= 0) {
      // Already past edge - maximum force
      tempBoundary.x += force;
    }

    // Right edge
    if (distRight < margin && distRight > 0) {
      const t = 1 - distRight / margin;
      const smoothT = smoothstep(0, 1, t);
      tempBoundary.x -= force * Math.pow(smoothT, power);
    } else if (distRight <= 0) {
      tempBoundary.x -= force;
    }

    // Top edge
    if (distTop < margin && distTop > 0) {
      const t = 1 - distTop / margin;
      const smoothT = smoothstep(0, 1, t);
      tempBoundary.y += force * Math.pow(smoothT, power);
    } else if (distTop <= 0) {
      tempBoundary.y += force;
    }

    // Bottom edge
    if (distBottom < margin && distBottom > 0) {
      const t = 1 - distBottom / margin;
      const smoothT = smoothstep(0, 1, t);
      tempBoundary.y -= force * Math.pow(smoothT, power);
    } else if (distBottom <= 0) {
      tempBoundary.y -= force;
    }

    // Apply as steering force for smooth direction change
    const boundaryMag = Math.sqrt(tempBoundary.x * tempBoundary.x + tempBoundary.y * tempBoundary.y);
    
    if (boundaryMag > 0.001) {
      // Calculate desired velocity direction (away from boundary)
      tempDesired.x = tempBoundary.x / boundaryMag * maxSpeed;
      tempDesired.y = tempBoundary.y / boundaryMag * maxSpeed;
      
      // Scale desired velocity by how strong the boundary force should be
      // This creates a gradual turn rather than an instant snap
      const forceRatio = Math.min(1, boundaryMag / force);
      tempDesired.x *= forceRatio;
      tempDesired.y *= forceRatio;
      
      // Steering = desired - current (Reynolds steering formula)
      tempDesired.x -= this.velocity.x * forceRatio;
      tempDesired.y -= this.velocity.y * forceRatio;
      
      // Limit steering force
      const steerMag = Math.sqrt(tempDesired.x * tempDesired.x + tempDesired.y * tempDesired.y);
      if (steerMag > maxForce) {
        tempDesired.x = tempDesired.x / steerMag * maxForce;
        tempDesired.y = tempDesired.y / steerMag * maxForce;
      }
      
      // Apply steering force to acceleration
      this.acceleration.x += tempDesired.x;
      this.acceleration.y += tempDesired.y;
    }
  }

  // ============================================================================
  // Field of View
  // ============================================================================

  isInFieldOfView(point: IVector2, fovDegrees: number): boolean {
    // If velocity is near zero, can see everything
    const velMagSq = this.velocity.magSq();
    if (velMagSq < 0.01) return true;

    // Calculate angle to point
    const dx = point.x - this.position.x;
    const dy = point.y - this.position.y;
    const angleToPoint = Math.atan2(dy, dx);

    // Calculate angular difference
    let diff = angleToPoint - this._heading;

    // Normalize to [-PI, PI]
    if (diff > Math.PI) diff -= Math.PI * 2;
    else if (diff < -Math.PI) diff += Math.PI * 2;

    // Check against half FOV (convert degrees to radians)
    const halfFov = (fovDegrees * Math.PI) / 360; // half of degrees in radians
    return diff > -halfFov && diff < halfFov;
  }

  // ============================================================================
  // State Management
  // ============================================================================

  applyPanic(level: number): void {
    this.panicLevel = Math.max(this.panicLevel, Math.min(1, level));
  }

  restoreEnergy(amount: number): void {
    this.energy = Math.min(1, this.energy + amount);
  }

  // Feeding state transitions
  startApproachingFood(foodId: number): void {
    this.feedingState = 'approaching';
    this.targetFoodId = foodId;
    this.feedingTimer = 0;
  }

  startGathering(): void {
    this.feedingState = 'gathering';
    this.feedingTimer = 0;
  }

  startFeeding(): void {
    this.feedingState = 'feeding';
    this.feedingTimer = 0;
  }

  exitFeedingState(): void {
    this.feedingState = 'none';
    this.targetFoodId = -1;
    this.feedingTimer = 0;
  }

  // Mating state transitions
  startSeeking(): void {
    this.matingState = 'seeking';
    this.targetMateId = -1;
    this.matingTimer = 0;
  }

  startApproachingMate(mateId: number): void {
    this.matingState = 'approaching';
    this.targetMateId = mateId;
    this.matingTimer = 0;
  }

  startCourting(): void {
    this.matingState = 'courting';
    this.matingTimer = 0;
  }

  startMating(): void {
    this.matingState = 'mating';
    this.matingTimer = 0;
  }

  startFighting(): void {
    this.matingState = 'fighting';
    this.matingTimer = 0;
  }

  endMatingBehavior(cooldown: number): void {
    this.matingState = 'cooldown';
    this.targetMateId = -1;
    this.matingTimer = 0;
    this.matingCooldown = cooldown;
  }

  clearMatingState(): void {
    this.matingState = 'none';
    this.targetMateId = -1;
    this.matingTimer = 0;
  }
}

// ============================================================================
// BirdArrays - Structure of Arrays for GPU Computation
// ============================================================================

export class BirdArrays {
  count: number;
  readonly maxCount: number;

  // Physics (Float32)
  positionX: Float32Array;
  positionY: Float32Array;
  velocityX: Float32Array;
  velocityY: Float32Array;
  accelerationX: Float32Array;
  accelerationY: Float32Array;
  heading: Float32Array;

  // State (Float32)
  panicLevel: Float32Array;
  localDensity: Float32Array;
  energy: Float32Array;
  aggressionLevel: Float32Array;

  // Firefly glow state (Float32)
  glowPhase: Float32Array;         // Current phase in flash cycle (0 to 2π)
  naturalFrequency: Float32Array;  // Individual natural flashing frequency (Hz)
  glowIntensity: Float32Array;     // Current glow brightness (0 to 1)

  // Timers (Float32)
  feedingTimer: Float32Array;
  matingTimer: Float32Array;
  matingCooldown: Float32Array;

  // Identity/Enums (Int32)
  id: Int32Array;
  speciesId: Int32Array;
  gender: Int32Array; // 0=female, 1=male
  feedingState: Int32Array; // 0=none, 1=approaching, 2=gathering, 3=feeding
  matingState: Int32Array; // 0-6 for different states
  targetFoodId: Int32Array;
  targetMateId: Int32Array;

  constructor(maxCount: number) {
    this.maxCount = maxCount;
    this.count = 0;

    // Physics
    this.positionX = new Float32Array(maxCount);
    this.positionY = new Float32Array(maxCount);
    this.velocityX = new Float32Array(maxCount);
    this.velocityY = new Float32Array(maxCount);
    this.accelerationX = new Float32Array(maxCount);
    this.accelerationY = new Float32Array(maxCount);
    this.heading = new Float32Array(maxCount);

    // State
    this.panicLevel = new Float32Array(maxCount);
    this.localDensity = new Float32Array(maxCount);
    this.energy = new Float32Array(maxCount);
    this.aggressionLevel = new Float32Array(maxCount);

    // Firefly glow state
    this.glowPhase = new Float32Array(maxCount);
    this.naturalFrequency = new Float32Array(maxCount);
    this.glowIntensity = new Float32Array(maxCount);

    // Timers
    this.feedingTimer = new Float32Array(maxCount);
    this.matingTimer = new Float32Array(maxCount);
    this.matingCooldown = new Float32Array(maxCount);

    // Identity
    this.id = new Int32Array(maxCount);
    this.speciesId = new Int32Array(maxCount);
    this.gender = new Int32Array(maxCount);
    this.feedingState = new Int32Array(maxCount);
    this.matingState = new Int32Array(maxCount);
    this.targetFoodId = new Int32Array(maxCount);
    this.targetMateId = new Int32Array(maxCount);
  }

  /**
   * Copy data from Bird array to SoA format.
   */
  fromBirds(birds: Bird[]): void {
    this.count = Math.min(birds.length, this.maxCount);

    for (let i = 0; i < this.count; i++) {
      const bird = birds[i];

      // Physics
      this.positionX[i] = bird.position.x;
      this.positionY[i] = bird.position.y;
      this.velocityX[i] = bird.velocity.x;
      this.velocityY[i] = bird.velocity.y;
      this.accelerationX[i] = bird.acceleration.x;
      this.accelerationY[i] = bird.acceleration.y;
      this.heading[i] = bird.heading;

      // State
      this.panicLevel[i] = bird.panicLevel;
      this.localDensity[i] = bird.localDensity;
      this.energy[i] = bird.energy;
      this.aggressionLevel[i] = bird.aggressionLevel;

      // Firefly glow state
      this.glowPhase[i] = bird.glowPhase;
      this.naturalFrequency[i] = bird.naturalFrequency;
      this.glowIntensity[i] = bird.glowIntensity;

      // Timers
      this.feedingTimer[i] = bird.feedingTimer;
      this.matingTimer[i] = bird.matingTimer;
      this.matingCooldown[i] = bird.matingCooldown;

      // Identity
      this.id[i] = bird.id;
      this.speciesId[i] = 0; // Default species
      this.gender[i] = bird.gender === 'male' ? 1 : 0;
      this.feedingState[i] = ['none', 'approaching', 'gathering', 'feeding'].indexOf(bird.feedingState);
      this.matingState[i] = ['none', 'seeking', 'approaching', 'courting', 'mating', 'fighting', 'cooldown'].indexOf(bird.matingState);
      this.targetFoodId[i] = bird.targetFoodId;
      this.targetMateId[i] = bird.targetMateId;
    }
  }

  /**
   * Copy data from SoA format back to Bird array.
   */
  toBirds(birds: Bird[]): void {
    const count = Math.min(this.count, birds.length);

    for (let i = 0; i < count; i++) {
      const bird = birds[i];

      // Physics
      bird.position.x = this.positionX[i];
      bird.position.y = this.positionY[i];
      bird.velocity.x = this.velocityX[i];
      bird.velocity.y = this.velocityY[i];
      bird.acceleration.x = this.accelerationX[i];
      bird.acceleration.y = this.accelerationY[i];

      // State
      bird.panicLevel = this.panicLevel[i];
      bird.localDensity = this.localDensity[i];
      bird.energy = this.energy[i];

      // Firefly glow state
      bird.glowPhase = this.glowPhase[i];
      bird.naturalFrequency = this.naturalFrequency[i];
      bird.glowIntensity = this.glowIntensity[i];
    }
  }

  /**
   * Initialize with random positions and velocities.
   */
  initializeRandom(count: number, width: number, height: number, margin: number = 50): void {
    this.count = Math.min(count, this.maxCount);

    for (let i = 0; i < this.count; i++) {
      // Random position within margins
      this.positionX[i] = margin + Math.random() * (width - margin * 2);
      this.positionY[i] = margin + Math.random() * (height - margin * 2);

      // Random velocity
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 4;
      this.velocityX[i] = Math.cos(angle) * speed;
      this.velocityY[i] = Math.sin(angle) * speed;

      // Clear acceleration
      this.accelerationX[i] = 0;
      this.accelerationY[i] = 0;

      // Heading from velocity
      this.heading[i] = angle;

      // Default state
      this.panicLevel[i] = 0;
      this.localDensity[i] = 0;
      this.energy[i] = 1.0;
      this.aggressionLevel[i] = Math.random() < 0.5 ? 0.5 + Math.random() * 0.5 : 0;

      // Firefly glow state - randomized for natural desynchronization
      this.glowPhase[i] = Math.random() * Math.PI * 2;
      this.naturalFrequency[i] = 0.8 + Math.random() * 0.4; // 0.8 to 1.2 Hz
      this.glowIntensity[i] = Math.sin(this.glowPhase[i]) ** 2;

      // Timers
      this.feedingTimer[i] = 0;
      this.matingTimer[i] = 0;
      this.matingCooldown[i] = 0;

      // Identity
      this.id[i] = i;
      this.speciesId[i] = 0;
      this.gender[i] = Math.random() < 0.5 ? 1 : 0;
      this.feedingState[i] = 0;
      this.matingState[i] = 0;
      this.targetFoodId[i] = -1;
      this.targetMateId[i] = -1;
    }
  }
}


