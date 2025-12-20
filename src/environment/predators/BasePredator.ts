import { Vector2 } from '../../utils/Vector2';
import { clamp } from '../../utils/MathUtils';
import type {
  PredatorType,
  PredatorBehaviorState,
  IPredatorState,
  IPredatorStats,
  ITargetScore,
  IVector2
} from '../../types';
import type { BirdArrays } from '../../simulation/Bird';

/**
 * Interface for pack coordination between predators.
 */
export interface IPackCoordinator {
  getPackMembers(): BasePredator[];
  getPackCenter(): IVector2;
  getAssignedSector(predatorId: number): number;
  isAttackSlotAvailable(): boolean;
  claimAttackSlot(predatorId: number): boolean;
  releaseAttackSlot(predatorId: number): void;
}

/**
 * Physics configuration for realistic predator movement.
 */
export interface IPredatorPhysics {
  // Inertia: how quickly predator can change direction (0-1, higher = more agile)
  agility: number;
  // Acceleration rate: how quickly predator reaches max speed
  acceleration: number;
  // Deceleration rate: how quickly predator slows down
  deceleration: number;
  // Turn radius factor: minimum turn radius at max speed (higher = wider turns)
  turnRadiusFactor: number;
  // Glide factor: energy efficiency while coasting (0-1)
  glideFactor: number;
  // Drag coefficient: air/water resistance
  drag: number;
}

// Default physics by environment type
const AERIAL_PHYSICS: IPredatorPhysics = {
  agility: 0.08,
  acceleration: 15,
  deceleration: 8,
  turnRadiusFactor: 0.3,
  glideFactor: 0.95,
  drag: 0.02
};

const MARINE_PHYSICS: IPredatorPhysics = {
  agility: 0.12,
  acceleration: 12,
  deceleration: 5,
  turnRadiusFactor: 0.2,
  glideFactor: 0.92,
  drag: 0.04
};

/**
 * Base class for predator AI with state machine behavior.
 * Version: 3.0.0 - Enhanced physics with inertia, turn radius, and realistic movement.
 */
export abstract class BasePredator implements IPredatorState {
  // Identity
  readonly id: number;
  readonly type: PredatorType;

  // Physics
  position: Vector2;
  velocity: Vector2;
  protected acceleration: Vector2 = new Vector2();
  protected targetVelocity: Vector2 = new Vector2(); // Desired velocity for smooth steering
  protected physics: IPredatorPhysics;
  
  // Visual state
  protected visualIntensity: number = 0; // For pulsing effects
  protected speedStretch: number = 1; // For speed-based stretching
  protected smoothedHeading: number = 0; // For smooth rotation

  // State
  state: PredatorBehaviorState = 'idle';
  energy: number;
  target: Vector2 | null = null;
  targetBirdId: number = -1;
  panicRadius: number;
  
  // Silent mode: reduced panic radius when stalking/ambushing
  protected silentMode: boolean = false;
  protected basePanicRadius: number;

  // Stats
  successfulHunts: number = 0;
  failedHunts: number = 0;

  // Timers
  protected stateTimer: number = 0;
  protected recoveryTimer: number = 0;
  protected targetLockTime: number = 0; // How long we've been pursuing current target

  // Configuration
  protected stats: IPredatorStats;
  protected maxSpeed: number;
  protected baseMaxSpeed: number;
  protected color: number;
  
  // Attack success modifiers (can be overridden by subclasses)
  protected baseAttackSuccessRate: number = 0.6;

  // Pack coordination (optional, for pack hunters like orca)
  protected packCoordinator: IPackCoordinator | null = null;

  // Temporary vectors
  protected tempVec = new Vector2();
  protected tempVec2 = new Vector2();

  constructor(
    id: number,
    type: PredatorType,
    x: number,
    y: number,
    stats: IPredatorStats,
    maxSpeed: number,
    panicRadius: number,
    color: number
  ) {
    this.id = id;
    this.type = type;
    this.position = new Vector2(x, y);
    this.velocity = Vector2.random().mult(maxSpeed * 0.3);
    this.stats = stats;
    this.maxSpeed = maxSpeed;
    this.baseMaxSpeed = maxSpeed;
    this.panicRadius = panicRadius;
    this.basePanicRadius = panicRadius;
    this.color = color;
    this.energy = stats.maxEnergy;
    this.smoothedHeading = this.velocity.heading();
    
    // Set physics based on predator type (aerial vs marine)
    this.physics = this.isMarinePredator() ? { ...MARINE_PHYSICS } : { ...AERIAL_PHYSICS };
  }

  /**
   * Check if this is a marine predator.
   */
  protected isMarinePredator(): boolean {
    return ['shark', 'orca', 'barracuda', 'sea-lion'].includes(this.type);
  }

  /**
   * Set pack coordinator for pack hunting species.
   */
  setPackCoordinator(coordinator: IPackCoordinator | null): void {
    this.packCoordinator = coordinator;
  }

  /**
   * Get effective panic radius (reduced in silent mode).
   */
  getEffectivePanicRadius(): number {
    return this.silentMode ? this.basePanicRadius * 0.3 : this.basePanicRadius;
  }

  /**
   * Get visual intensity for rendering effects (0-1).
   */
  getVisualIntensity(): number {
    return this.visualIntensity;
  }

  /**
   * Get speed stretch factor for visual elongation.
   */
  getSpeedStretch(): number {
    return this.speedStretch;
  }

  /**
   * Get smoothed heading for visual rotation.
   */
  getSmoothedHeading(): number {
    return this.smoothedHeading;
  }

  /**
   * Update predator AI.
   */
  update(
    dt: number,
    birdArrays: BirdArrays,
    worldWidth: number,
    worldHeight: number
  ): void {
    this.stateTimer += dt;
    
    // Track target lock time
    if (this.targetBirdId >= 0) {
      this.targetLockTime += dt;
    } else {
      this.targetLockTime = 0;
    }

    // Update visual effects
    this.updateVisualState(dt);

    // State machine
    switch (this.state) {
      case 'idle':
        this.silentMode = false;
        this.updateIdle(dt, birdArrays);
        break;
      case 'scanning':
        this.silentMode = false;
        this.updateScanning(dt, birdArrays);
        break;
      case 'stalking':
        this.silentMode = true;
        this.updateStalking(dt, birdArrays);
        break;
      case 'hunting':
        this.silentMode = false;
        this.updateHunting(dt, birdArrays);
        break;
      case 'attacking':
        this.silentMode = false;
        this.updateAttacking(dt, birdArrays);
        break;
      case 'diving':
        this.silentMode = false;
        this.updateDiving(dt, birdArrays);
        break;
      case 'ambushing':
        this.silentMode = true;
        this.updateAmbushing(dt, birdArrays);
        break;
      case 'ascending':
        this.silentMode = false;
        this.updateAscending(dt, birdArrays);
        break;
      case 'circling':
        this.silentMode = true;
        this.updateCircling(dt, birdArrays);
        break;
      case 'herding':
        this.silentMode = false;
        this.updateHerding(dt, birdArrays);
        break;
      case 'recovering':
        this.silentMode = false;
        this.updateRecovering(dt);
        break;
    }
    
    // Update effective panic radius based on silent mode
    this.panicRadius = this.getEffectivePanicRadius();

    // Apply realistic physics
    this.applyPhysics(dt, worldWidth, worldHeight);

    // Update max speed based on energy (tired predator is slower)
    const energyFactor = 0.6 + this.energy * 0.4;
    this.maxSpeed = this.baseMaxSpeed * energyFactor;

    // Regenerate energy when not actively hunting
    if (this.state === 'idle' || this.state === 'scanning' || this.state === 'circling') {
      this.energy = Math.min(this.stats.maxEnergy, this.energy + this.stats.energyRegenRate * dt);
    }

    // Drain energy when hunting - more drain at higher speeds
    if (this.state === 'hunting' || this.state === 'attacking' || this.state === 'diving') {
      const speedFactor = 1 + (this.velocity.mag() / this.baseMaxSpeed) * 0.5;
      this.energy = Math.max(0, this.energy - this.stats.huntingDrain * dt * speedFactor);

      // Exhausted - must recover
      if (this.energy < this.stats.exhaustionThreshold) {
        this.enterState('recovering');
      }
    }
  }

  /**
   * Update visual state for rendering effects.
   */
  protected updateVisualState(dt: number): void {
    // Calculate visual intensity based on state
    let targetIntensity = 0;
    switch (this.state) {
      case 'idle':
      case 'recovering':
        targetIntensity = 0.2;
        break;
      case 'scanning':
      case 'circling':
        targetIntensity = 0.4;
        break;
      case 'stalking':
      case 'ambushing':
        targetIntensity = 0.5;
        break;
      case 'hunting':
      case 'herding':
        targetIntensity = 0.7;
        break;
      case 'ascending':
        targetIntensity = 0.6;
        break;
      case 'diving':
      case 'attacking':
        targetIntensity = 1.0;
        break;
    }
    
    // Smooth intensity transition
    this.visualIntensity += (targetIntensity - this.visualIntensity) * dt * 3;

    // Calculate speed stretch (elongation at high speeds)
    const speed = this.velocity.mag();
    const speedRatio = speed / this.baseMaxSpeed;
    this.speedStretch = 1 + speedRatio * 0.4; // Up to 40% stretch at max speed

    // Smooth heading for natural rotation
    const currentHeading = this.velocity.heading();
    let headingDiff = currentHeading - this.smoothedHeading;
    
    // Normalize angle difference to [-PI, PI]
    while (headingDiff > Math.PI) headingDiff -= Math.PI * 2;
    while (headingDiff < -Math.PI) headingDiff += Math.PI * 2;
    
    // Smooth rotation (faster when moving quickly)
    const rotationSpeed = 2 + speedRatio * 4;
    this.smoothedHeading += headingDiff * Math.min(1, dt * rotationSpeed);
  }

  /**
   * Apply realistic physics with inertia, turn radius, and drag.
   */
  protected applyPhysics(dt: number, worldWidth: number, worldHeight: number): void {
    const physics = this.physics;
    const speed = this.velocity.mag();
    
    // Calculate effective max speed based on state
    let effectiveMaxSpeed = this.maxSpeed;
    if (this.state === 'diving' || this.state === 'attacking') {
      effectiveMaxSpeed *= this.stats.burstMultiplier;
    } else if (this.state === 'recovering') {
      effectiveMaxSpeed *= 0.4;
    }

    // Apply turn radius constraint at high speeds
    // At max speed, predator can't turn as sharply
    if (speed > 1 && this.targetVelocity.magSq() > 0.01) {
      const desiredHeading = this.targetVelocity.heading();
      const currentHeading = this.velocity.heading();
      
      let headingDiff = desiredHeading - currentHeading;
      while (headingDiff > Math.PI) headingDiff -= Math.PI * 2;
      while (headingDiff < -Math.PI) headingDiff += Math.PI * 2;
      
      // Limit turn rate based on speed
      const maxTurnRate = physics.agility / (1 + speed * 0.05);
      const limitedDiff = clamp(headingDiff, -maxTurnRate, maxTurnRate);
      
      // Apply limited turn
      const newHeading = currentHeading + limitedDiff;
      const targetSpeed = this.targetVelocity.mag();
      this.tempVec.set(Math.cos(newHeading), Math.sin(newHeading));
      this.tempVec.mult(Math.min(targetSpeed, effectiveMaxSpeed));
      
      // Smooth velocity change with inertia
      this.velocity.lerp(this.tempVec, physics.agility);
    }

    // Apply drag (air/water resistance)
    const dragFactor = 1 - physics.drag * speed * dt;
    this.velocity.mult(Math.max(0.5, dragFactor));

    // Apply glide factor when not actively accelerating
    if (this.state === 'idle' || this.state === 'scanning' || this.state === 'recovering') {
      this.velocity.mult(physics.glideFactor);
    }

    // Limit velocity to effective max
    if (speed > effectiveMaxSpeed) {
      this.velocity.setMag(effectiveMaxSpeed);
    }

    // Minimum speed threshold (predators don't hover)
    const minSpeed = this.isMarinePredator() ? 1 : 2;
    if (speed < minSpeed && this.state !== 'ambushing') {
      if (speed > 0.1) {
        this.velocity.setMag(minSpeed);
      } else {
        // Give small push in random direction
        this.velocity.set(Math.random() - 0.5, Math.random() - 0.5).setMag(minSpeed);
      }
    }

    // Update position
    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;

    // Soft boundary with realistic banking turn
    const margin = 120;
    const boundaryForce = 0.5;
    
    if (this.position.x < margin) {
      const urgency = 1 - this.position.x / margin;
      this.velocity.x += boundaryForce * urgency * urgency;
    } else if (this.position.x > worldWidth - margin) {
      const urgency = (this.position.x - (worldWidth - margin)) / margin;
      this.velocity.x -= boundaryForce * urgency * urgency;
    }
    
    if (this.position.y < margin) {
      const urgency = 1 - this.position.y / margin;
      this.velocity.y += boundaryForce * urgency * urgency;
    } else if (this.position.y > worldHeight - margin) {
      const urgency = (this.position.y - (worldHeight - margin)) / margin;
      this.velocity.y -= boundaryForce * urgency * urgency;
    }

    // Hard clamp with velocity reflection
    const pad = 30;
    if (this.position.x < pad) {
      this.position.x = pad;
      this.velocity.x = Math.abs(this.velocity.x) * 0.7;
    } else if (this.position.x > worldWidth - pad) {
      this.position.x = worldWidth - pad;
      this.velocity.x = -Math.abs(this.velocity.x) * 0.7;
    }
    
    if (this.position.y < pad) {
      this.position.y = pad;
      this.velocity.y = Math.abs(this.velocity.y) * 0.7;
    } else if (this.position.y > worldHeight - pad) {
      this.position.y = worldHeight - pad;
      this.velocity.y = -Math.abs(this.velocity.y) * 0.7;
    }
  }

  /**
   * Enter a new state.
   */
  protected enterState(newState: PredatorBehaviorState): void {
    this.state = newState;
    this.stateTimer = 0;
  }

  /**
   * Score potential targets.
   * Override in subclasses for different hunting styles.
   */
  protected abstract scoreBird(
    birdIndex: number,
    birdArrays: BirdArrays
  ): ITargetScore;

  /**
   * Find best target bird.
   */
  protected findTarget(birdArrays: BirdArrays): ITargetScore | null {
    let bestScore: ITargetScore | null = null;
    let bestTotal = -Infinity;

    const count = birdArrays.count;
    const searchRadius = this.panicRadius * 2;
    const searchRadiusSq = searchRadius * searchRadius;

    for (let i = 0; i < count; i++) {
      const dx = birdArrays.positionX[i] - this.position.x;
      const dy = birdArrays.positionY[i] - this.position.y;
      const distSq = dx * dx + dy * dy;

      if (distSq < searchRadiusSq) {
        const score = this.scoreBird(i, birdArrays);
        if (score.totalScore > bestTotal) {
          bestTotal = score.totalScore;
          bestScore = score;
        }
      }
    }

    return bestScore;
  }

  /**
   * Seek towards target position with realistic steering.
   */
  protected seekTarget(target: IVector2, speedMultiplier: number = 1): void {
    this.tempVec.copy(target).sub(this.position);
    const dist = this.tempVec.mag();

    if (dist > 0) {
      // Set target velocity for physics system
      const targetSpeed = this.maxSpeed * speedMultiplier;
      this.tempVec.setMag(targetSpeed);
      this.targetVelocity.copy(this.tempVec);
      
      // Apply gradual acceleration towards target velocity
      const accelRate = this.physics.acceleration * 0.01;
      this.velocity.lerp(this.tempVec, accelRate);
    }
  }

  /**
   * Seek with intercept prediction for moving targets.
   */
  protected seekWithIntercept(target: IVector2, targetVel: IVector2, speedMultiplier: number = 1): void {
    // Predict where target will be
    const dist = this.position.dist(target);
    const closingSpeed = this.maxSpeed * speedMultiplier;
    const interceptTime = dist / closingSpeed * 0.5; // Look ahead
    
    const interceptX = target.x + targetVel.x * interceptTime;
    const interceptY = target.y + targetVel.y * interceptTime;
    
    this.seekTarget({ x: interceptX, y: interceptY }, speedMultiplier);
  }

  /**
   * Wander with smooth, realistic random movement.
   */
  protected wander(strength: number = 0.5): void {
    // Perlin-like smooth wander using sin waves
    const time = performance.now() * 0.001;
    const wanderAngle = Math.sin(time * 0.5 + this.id * 100) * Math.PI * 0.3;
    
    const currentHeading = this.velocity.heading();
    const targetHeading = currentHeading + wanderAngle * strength;
    
    this.tempVec.x = Math.cos(targetHeading);
    this.tempVec.y = Math.sin(targetHeading);
    this.tempVec.mult(this.maxSpeed * 0.5);
    
    // Set as target velocity for smooth transition
    this.targetVelocity.lerp(this.tempVec, 0.3);
    this.velocity.lerp(this.tempVec, strength * 0.05);
  }

  /**
   * Glide/coast with minimal energy expenditure.
   */
  protected glide(): void {
    // Maintain current heading with slight deceleration
    const speed = this.velocity.mag();
    if (speed > 0) {
      this.targetVelocity.copy(this.velocity).setMag(speed * 0.98);
    }
  }

  /**
   * Burst acceleration for attacks.
   */
  protected burst(target: IVector2, burstMultiplier: number = 1): void {
    this.tempVec.copy(target).sub(this.position);
    const dist = this.tempVec.mag();
    
    if (dist > 0) {
      const burstSpeed = this.maxSpeed * this.stats.burstMultiplier * burstMultiplier;
      this.tempVec.setMag(burstSpeed);
      this.targetVelocity.copy(this.tempVec);
      
      // Faster acceleration during burst
      this.velocity.lerp(this.tempVec, this.physics.acceleration * 0.03);
    }
  }

  // ============================================================================
  // State Handlers (override in subclasses for different behaviors)
  // ============================================================================

  protected updateIdle(_dt: number, _birdArrays: BirdArrays): void {
    this.wander(0.3);

    // Periodically scan for targets
    if (this.stateTimer > 2 + Math.random() * 3) {
      this.enterState('scanning');
    }
  }

  protected updateScanning(_dt: number, birdArrays: BirdArrays): void {
    // Slow movement while scanning
    this.velocity.mult(0.98);

    const target = this.findTarget(birdArrays);

    if (target && target.totalScore > 0.3) {
      this.targetBirdId = target.birdId;
      this.target = new Vector2(target.position.x, target.position.y);
      this.enterState('stalking');
    } else if (this.stateTimer > 3) {
      this.enterState('idle');
    }
  }

  protected updateStalking(_dt: number, birdArrays: BirdArrays): void {
    if (this.targetBirdId < 0 || this.targetBirdId >= birdArrays.count) {
      this.enterState('scanning');
      return;
    }

    // Update target position
    this.target!.x = birdArrays.positionX[this.targetBirdId];
    this.target!.y = birdArrays.positionY[this.targetBirdId];

    // Approach at moderate speed
    this.seekTarget(this.target!, 0.6);

    const dist = this.position.dist(this.target!);

    // Transition to hunting when close enough
    if (dist < this.panicRadius * 0.8) {
      this.enterState('hunting');
    }

    // Give up if too far
    if (dist > this.panicRadius * 3) {
      this.enterState('scanning');
    }
  }

  protected updateHunting(_dt: number, birdArrays: BirdArrays): void {
    if (this.targetBirdId < 0 || this.targetBirdId >= birdArrays.count) {
      this.enterState('scanning');
      return;
    }

    // Update target position
    this.target!.x = birdArrays.positionX[this.targetBirdId];
    this.target!.y = birdArrays.positionY[this.targetBirdId];

    // Chase at full speed
    this.seekTarget(this.target!, 1.0);

    const dist = this.position.dist(this.target!);

    // Close enough to attack
    if (dist < 30) {
      this.enterState('attacking');
    }

    // Lost target
    if (dist > this.panicRadius * 2) {
      this.failedHunts++;
      this.enterState('recovering');
    }
  }

  protected updateAttacking(_dt: number, birdArrays: BirdArrays): void {
    // Attack animation/effect
    if (this.stateTimer > 0.5) {
      // Spend attack energy
      this.energy = Math.max(0, this.energy - this.stats.attackCost);

      // Calculate contextual success chance
      const successChance = this.calculateAttackSuccess(birdArrays);
      
      if (Math.random() < successChance) {
        this.successfulHunts++;
        this.energy = Math.min(this.stats.maxEnergy, this.energy + 0.3);
      } else {
        this.failedHunts++;
      }

      // Release attack slot if using pack coordination
      this.packCoordinator?.releaseAttackSlot(this.id);

      this.enterState('recovering');
    }
  }

  /**
   * Calculate contextual attack success rate based on predator and prey state.
   */
  protected calculateAttackSuccess(birdArrays: BirdArrays): number {
    if (this.targetBirdId < 0 || this.targetBirdId >= birdArrays.count) {
      return this.baseAttackSuccessRate;
    }

    // Target exhaustion: tired prey is easier to catch
    const targetEnergy = birdArrays.energy[this.targetBirdId];
    const exhaustionBonus = 1.0 + (1 - targetEnergy) * 0.4;

    // Surprise factor: unaware prey is easier to catch
    const targetPanic = birdArrays.panicLevel[this.targetBirdId];
    const surpriseBonus = 1.0 + (1 - targetPanic) * 0.3;

    // Isolation factor: isolated prey is easier
    const targetDensity = birdArrays.localDensity[this.targetBirdId];
    const isolationBonus = 1.0 + (1 - targetDensity) * 0.2;

    // Speed approach: higher speed attacks have bonus
    const approachSpeed = this.velocity.mag() / this.maxSpeed;
    const speedBonus = 0.9 + approachSpeed * 0.2;

    const finalChance = this.baseAttackSuccessRate * exhaustionBonus * surpriseBonus * isolationBonus * speedBonus;
    return clamp(finalChance, 0.2, 0.95);
  }

  protected updateDiving(dt: number, birdArrays: BirdArrays): void {
    // Override in falcon/hawk for dive attacks
    this.updateHunting(dt, birdArrays);
  }

  protected updateAmbushing(dt: number, birdArrays: BirdArrays): void {
    // Override in owl for ambush attacks
    // Default: stay very still
    this.velocity.mult(0.85);
    this.updateStalking(dt, birdArrays);
  }

  protected updateAscending(_dt: number, birdArrays: BirdArrays): void {
    // Override in falcon for altitude gain before stoop
    // Default: move away from target while gaining "altitude"
    if (this.targetBirdId < 0 || this.targetBirdId >= birdArrays.count) {
      this.enterState('scanning');
      return;
    }

    // Update target position
    this.target!.x = birdArrays.positionX[this.targetBirdId];
    this.target!.y = birdArrays.positionY[this.targetBirdId];

    // Move perpendicular/away from target (gaining altitude simulation)
    const dx = this.position.x - this.target!.x;
    const dy = this.position.y - this.target!.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 0) {
      // Move away to gain distance for dive
      this.tempVec.set(dx / dist, dy / dist).mult(this.maxSpeed * 0.6);
      this.velocity.lerp(this.tempVec, 0.08);
    }

    // Transition to diving when at good distance and timer elapsed
    if (this.stateTimer > 1.5 && dist > this.panicRadius * 0.8) {
      this.enterState('diving');
    }

    // Give up if too far
    if (dist > this.panicRadius * 4) {
      this.enterState('scanning');
    }
  }

  protected updateCircling(dt: number, birdArrays: BirdArrays): void {
    // Override in shark for circling behavior
    // Default: orbit around target
    if (this.targetBirdId < 0 || this.targetBirdId >= birdArrays.count) {
      this.enterState('scanning');
      return;
    }

    // Update target position
    this.target!.x = birdArrays.positionX[this.targetBirdId];
    this.target!.y = birdArrays.positionY[this.targetBirdId];

    // Simple circular motion around target
    const orbitRadius = this.panicRadius * 0.7;
    const orbitSpeed = 0.5; // radians per second
    const angle = Math.atan2(
      this.position.y - this.target!.y,
      this.position.x - this.target!.x
    ) + orbitSpeed * dt;

    const targetX = this.target!.x + Math.cos(angle) * orbitRadius;
    const targetY = this.target!.y + Math.sin(angle) * orbitRadius;

    this.seekTarget({ x: targetX, y: targetY }, 0.7);

    // Transition to hunting after circling
    if (this.stateTimer > 4) {
      this.enterState('hunting');
    }
  }

  protected updateHerding(_dt: number, birdArrays: BirdArrays): void {
    // Override in orca for pack herding behavior
    // Default: push prey toward pack center
    if (!this.packCoordinator || this.targetBirdId < 0) {
      this.enterState('scanning');
      return;
    }

    const packCenter = this.packCoordinator.getPackCenter();
    
    // Update target position
    this.target!.x = birdArrays.positionX[this.targetBirdId];
    this.target!.y = birdArrays.positionY[this.targetBirdId];

    // Position between prey and escape route (opposite of pack center)
    const preyToCenter = {
      x: packCenter.x - this.target!.x,
      y: packCenter.y - this.target!.y
    };
    const dist = Math.sqrt(preyToCenter.x ** 2 + preyToCenter.y ** 2);
    
    if (dist > 0) {
      // Position behind prey (from prey's perspective of pack center)
      const herdPos = {
        x: this.target!.x - (preyToCenter.x / dist) * this.panicRadius * 0.5,
        y: this.target!.y - (preyToCenter.y / dist) * this.panicRadius * 0.5
      };
      this.seekTarget(herdPos, 0.8);
    }

    // Check if attack slot is available
    if (this.stateTimer > 3 && this.packCoordinator.isAttackSlotAvailable()) {
      if (this.packCoordinator.claimAttackSlot(this.id)) {
        this.enterState('hunting');
      }
    }
  }

  protected updateRecovering(dt: number): void {
    this.recoveryTimer += dt;
    this.velocity.mult(0.95);
    this.wander(0.1);

    // Energy regen during recovery
    this.energy = Math.min(this.stats.maxEnergy, this.energy + this.stats.energyRegenRate * dt * 2);

    if (this.recoveryTimer > this.stats.staminaRecoveryDelay) {
      this.recoveryTimer = 0;
      this.target = null;
      this.targetBirdId = -1;
      this.targetLockTime = 0;
      this.enterState('idle');
    }
  }

  // ============================================================================
  // Utility Methods for Subclasses
  // ============================================================================

  /**
   * Calculate flock center from visible birds.
   */
  protected calculateFlockCenter(birdArrays: BirdArrays): IVector2 {
    let sumX = 0, sumY = 0, count = 0;
    const searchRadius = this.panicRadius * 3;
    const searchRadiusSq = searchRadius * searchRadius;

    for (let i = 0; i < birdArrays.count; i++) {
      const dx = birdArrays.positionX[i] - this.position.x;
      const dy = birdArrays.positionY[i] - this.position.y;
      const distSq = dx * dx + dy * dy;

      if (distSq < searchRadiusSq) {
        sumX += birdArrays.positionX[i];
        sumY += birdArrays.positionY[i];
        count++;
      }
    }

    if (count > 0) {
      return { x: sumX / count, y: sumY / count };
    }
    return { x: this.position.x, y: this.position.y };
  }

  /**
   * Get neighbor count for a specific bird.
   */
  protected getBirdNeighborCount(birdIndex: number, birdArrays: BirdArrays, radius: number = 50): number {
    const bx = birdArrays.positionX[birdIndex];
    const by = birdArrays.positionY[birdIndex];
    const radiusSq = radius * radius;
    let count = 0;

    for (let i = 0; i < birdArrays.count; i++) {
      if (i === birdIndex) continue;
      const dx = birdArrays.positionX[i] - bx;
      const dy = birdArrays.positionY[i] - by;
      if (dx * dx + dy * dy < radiusSq) {
        count++;
      }
    }

    return count;
  }

  /**
   * Predict future position of target bird.
   */
  protected predictTargetPosition(birdArrays: BirdArrays, lookAhead: number): IVector2 | null {
    if (this.targetBirdId < 0 || this.targetBirdId >= birdArrays.count) {
      return null;
    }

    const bx = birdArrays.positionX[this.targetBirdId];
    const by = birdArrays.positionY[this.targetBirdId];
    const vx = birdArrays.velocityX[this.targetBirdId];
    const vy = birdArrays.velocityY[this.targetBirdId];

    return {
      x: bx + vx * lookAhead,
      y: by + vy * lookAhead
    };
  }

  /**
   * Check if target is still valid.
   */
  protected isTargetValid(birdArrays: BirdArrays): boolean {
    return this.targetBirdId >= 0 && this.targetBirdId < birdArrays.count;
  }

  /**
   * Get predator color.
   */
  getColor(): number {
    return this.color;
  }

  /**
   * Get heading angle.
   */
  get heading(): number {
    return this.velocity.heading();
  }

  /**
   * Get base panic radius (ignoring silent mode).
   */
  getBasePanicRadius(): number {
    return this.basePanicRadius;
  }

  /**
   * Check if in silent mode.
   */
  isSilent(): boolean {
    return this.silentMode;
  }
}

