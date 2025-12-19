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
 * Base class for predator AI with state machine behavior.
 */
export abstract class BasePredator implements IPredatorState {
  // Identity
  readonly id: number;
  readonly type: PredatorType;

  // Physics
  position: Vector2;
  velocity: Vector2;

  // State
  state: PredatorBehaviorState = 'idle';
  energy: number;
  target: Vector2 | null = null;
  targetBirdId: number = -1;
  panicRadius: number;

  // Stats
  successfulHunts: number = 0;
  failedHunts: number = 0;

  // Timers
  protected stateTimer: number = 0;
  protected recoveryTimer: number = 0;

  // Configuration
  protected stats: IPredatorStats;
  protected maxSpeed: number;
  protected color: number;

  // Temporary vectors
  protected tempVec = new Vector2();

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
    this.velocity = Vector2.random().mult(5);
    this.stats = stats;
    this.maxSpeed = maxSpeed;
    this.panicRadius = panicRadius;
    this.color = color;
    this.energy = stats.maxEnergy;
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

    // State machine
    switch (this.state) {
      case 'idle':
        this.updateIdle(dt, birdArrays);
        break;
      case 'scanning':
        this.updateScanning(dt, birdArrays);
        break;
      case 'stalking':
        this.updateStalking(dt, birdArrays);
        break;
      case 'hunting':
        this.updateHunting(dt, birdArrays);
        break;
      case 'attacking':
        this.updateAttacking(dt, birdArrays);
        break;
      case 'diving':
        this.updateDiving(dt, birdArrays);
        break;
      case 'ambushing':
        this.updateAmbushing(dt, birdArrays);
        break;
      case 'recovering':
        this.updateRecovering(dt);
        break;
    }

    // Apply physics
    this.applyPhysics(dt, worldWidth, worldHeight);

    // Regenerate energy when not actively hunting
    if (this.state === 'idle' || this.state === 'scanning') {
      this.energy = Math.min(this.stats.maxEnergy, this.energy + this.stats.energyRegenRate * dt);
    }

    // Drain energy when hunting
    if (this.state === 'hunting' || this.state === 'attacking') {
      this.energy = Math.max(0, this.energy - this.stats.huntingDrain * dt);

      // Exhausted - must recover
      if (this.energy < this.stats.exhaustionThreshold) {
        this.enterState('recovering');
      }
    }
  }

  /**
   * Apply physics (velocity, boundary).
   */
  protected applyPhysics(dt: number, worldWidth: number, worldHeight: number): void {
    // Limit velocity
    this.velocity.limit(this.maxSpeed);

    // Update position
    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;

    // Soft boundary
    const margin = 100;
    if (this.position.x < margin) {
      this.velocity.x += (margin - this.position.x) * 0.01;
    } else if (this.position.x > worldWidth - margin) {
      this.velocity.x -= (this.position.x - (worldWidth - margin)) * 0.01;
    }
    if (this.position.y < margin) {
      this.velocity.y += (margin - this.position.y) * 0.01;
    } else if (this.position.y > worldHeight - margin) {
      this.velocity.y -= (this.position.y - (worldHeight - margin)) * 0.01;
    }

    // Hard clamp
    this.position.x = clamp(this.position.x, 20, worldWidth - 20);
    this.position.y = clamp(this.position.y, 20, worldHeight - 20);
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
   * Seek towards target position.
   */
  protected seekTarget(target: IVector2, speedMultiplier: number = 1): void {
    this.tempVec.copy(target).sub(this.position);
    const dist = this.tempVec.mag();

    if (dist > 0) {
      this.tempVec.setMag(this.maxSpeed * speedMultiplier);
      this.velocity.lerp(this.tempVec, 0.1);
    }
  }

  /**
   * Wander randomly.
   */
  protected wander(strength: number = 0.5): void {
    const wanderAngle = (Math.random() - 0.5) * Math.PI;
    this.tempVec.x = Math.cos(this.velocity.heading() + wanderAngle);
    this.tempVec.y = Math.sin(this.velocity.heading() + wanderAngle);
    this.tempVec.mult(strength);
    this.velocity.add(this.tempVec);
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

  protected updateAttacking(_dt: number, _birdArrays: BirdArrays): void {
    // Attack animation/effect
    if (this.stateTimer > 0.5) {
      // Spend attack energy
      this.energy = Math.max(0, this.energy - this.stats.attackCost);

      // Random success chance (70%)
      if (Math.random() < 0.7) {
        this.successfulHunts++;
        this.energy = Math.min(this.stats.maxEnergy, this.energy + 0.3);
      } else {
        this.failedHunts++;
      }

      this.enterState('recovering');
    }
  }

  protected updateDiving(dt: number, birdArrays: BirdArrays): void {
    // Override in falcon/hawk for dive attacks
    this.updateHunting(dt, birdArrays);
  }

  protected updateAmbushing(dt: number, birdArrays: BirdArrays): void {
    // Override in owl for ambush attacks
    this.updateStalking(dt, birdArrays);
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
      this.enterState('idle');
    }
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
}

