import { BasePredator, IPackCoordinator } from './BasePredator';
import { Vector2 } from '../../utils/Vector2';
import type {
  PredatorType,
  IPredatorStats,
  ITargetScore,
  IPredatorPreset,
  IVector2
} from '../../types';
import type { BirdArrays } from '../../simulation/Bird';

// Version: 3.0.0 - Enhanced physics and species-specific movement characteristics

// Default stats for different predator types
const PREDATOR_STATS: Record<PredatorType, IPredatorStats> = {
  hawk: {
    maxEnergy: 1.0,
    energyRegenRate: 0.05,
    huntingDrain: 0.1,
    attackCost: 0.3,
    exhaustionThreshold: 0.2,
    burstMultiplier: 1.3,
    staminaRecoveryDelay: 3
  },
  falcon: {
    maxEnergy: 0.8,
    energyRegenRate: 0.04,
    huntingDrain: 0.15,
    attackCost: 0.4,
    exhaustionThreshold: 0.15,
    burstMultiplier: 2.2,
    staminaRecoveryDelay: 5
  },
  eagle: {
    maxEnergy: 1.2,
    energyRegenRate: 0.06,
    huntingDrain: 0.06,
    attackCost: 0.25,
    exhaustionThreshold: 0.25,
    burstMultiplier: 1.2,
    staminaRecoveryDelay: 2.5
  },
  owl: {
    maxEnergy: 0.9,
    energyRegenRate: 0.07,
    huntingDrain: 0.05,
    attackCost: 0.35,
    exhaustionThreshold: 0.3,
    burstMultiplier: 1.8,
    staminaRecoveryDelay: 4
  },
  shark: {
    maxEnergy: 1.0,
    energyRegenRate: 0.04,
    huntingDrain: 0.08,
    attackCost: 0.3,
    exhaustionThreshold: 0.2,
    burstMultiplier: 1.5,
    staminaRecoveryDelay: 3.5
  },
  orca: {
    maxEnergy: 1.5,
    energyRegenRate: 0.03,
    huntingDrain: 0.07,
    attackCost: 0.2,
    exhaustionThreshold: 0.2,
    burstMultiplier: 1.4,
    staminaRecoveryDelay: 2
  },
  barracuda: {
    maxEnergy: 0.7,
    energyRegenRate: 0.1,
    huntingDrain: 0.25,
    attackCost: 0.25,
    exhaustionThreshold: 0.15,
    burstMultiplier: 2.5,
    staminaRecoveryDelay: 1.5
  },
  'sea-lion': {
    maxEnergy: 1.1,
    energyRegenRate: 0.05,
    huntingDrain: 0.09,
    attackCost: 0.28,
    exhaustionThreshold: 0.22,
    burstMultiplier: 1.3,
    staminaRecoveryDelay: 3
  }
};

const DEFAULT_PRESETS: Record<PredatorType, IPredatorPreset> = {
  hawk: { name: 'Hawk', maxSpeed: 18, panicRadius: 120, huntingStyle: 'edge', color: 0xcc6600 },
  falcon: { name: 'Falcon', maxSpeed: 25, panicRadius: 180, huntingStyle: 'stoop', color: 0x8844aa },
  eagle: { name: 'Eagle', maxSpeed: 16, panicRadius: 150, huntingStyle: 'sustained', color: 0x886622 },
  owl: { name: 'Owl', maxSpeed: 14, panicRadius: 60, huntingStyle: 'ambush', color: 0x444466 },
  shark: { name: 'Shark', maxSpeed: 14, panicRadius: 100, huntingStyle: 'circling', color: 0x445566 },
  orca: { name: 'Orca', maxSpeed: 16, panicRadius: 140, huntingStyle: 'pack', color: 0x222222 },
  barracuda: { name: 'Barracuda', maxSpeed: 28, panicRadius: 70, huntingStyle: 'burst', color: 0x667788 },
  'sea-lion': { name: 'Sea Lion', maxSpeed: 15, panicRadius: 110, huntingStyle: 'sustained', color: 0x554433 }
};

// ============================================================================
// HAWK - Edge Hunter
// Patrols flock edges, targets isolated stragglers
// ============================================================================

class HawkPredator extends BasePredator {
  private patrolAngle: number = 0;
  private flockCenter: IVector2 = { x: 0, y: 0 };

  constructor(
    id: number, type: PredatorType, x: number, y: number,
    stats: IPredatorStats, maxSpeed: number, panicRadius: number, color: number
  ) {
    super(id, type, x, y, stats, maxSpeed, panicRadius, color);
    this.baseAttackSuccessRate = 0.65;
    
    // Hawk physics: balanced, good acceleration and agility
    this.physics.acceleration = 18;
    this.physics.agility = 0.12;
    this.physics.turnRadiusFactor = 0.22;
    this.physics.glideFactor = 0.96;
  }

  protected scoreBird(birdIndex: number, birdArrays: BirdArrays): ITargetScore {
    const bx = birdArrays.positionX[birdIndex];
    const by = birdArrays.positionY[birdIndex];
    const dist = this.position.dist({ x: bx, y: by });

    // Count actual neighbors for isolation score
    const neighborCount = this.getBirdNeighborCount(birdIndex, birdArrays, 40);
    const isolationScore = neighborCount < 3 ? 1.0 : Math.max(0, 1 - neighborCount / 10);

    // Edge detection: distance from flock center
    const flockCenter = this.calculateFlockCenter(birdArrays);
    const distFromCenter = Math.sqrt(
      (bx - flockCenter.x) ** 2 + (by - flockCenter.y) ** 2
    );
    const edgeScore = Math.min(distFromCenter / 150, 1.0);

    // Prefer slower birds
    const speed = Math.sqrt(
      birdArrays.velocityX[birdIndex] ** 2 +
      birdArrays.velocityY[birdIndex] ** 2
    );
    const velocityScore = 1 - Math.min(speed / 20, 1);

    // Non-panicked birds are less alert
    const panicScore = 1 - birdArrays.panicLevel[birdIndex];

    // Distance factor
    const distanceFactor = 1 - Math.min(dist / (this.panicRadius * 2), 1);

    const totalScore = (
      isolationScore * 0.40 +
      edgeScore * 0.25 +
      velocityScore * 0.10 +
      panicScore * 0.15 +
      distanceFactor * 0.10
    );

    return {
      birdId: birdIndex,
      position: { x: bx, y: by },
      isolationScore,
      edgeScore,
      velocityScore,
      panicScore,
      interceptScore: distanceFactor,
      totalScore
    };
  }

  protected updateIdle(dt: number, birdArrays: BirdArrays): void {
    // Patrol along flock perimeter
    this.flockCenter = this.calculateFlockCenter(birdArrays);
    this.patrolAngle += dt * 0.3;

    const patrolRadius = this.panicRadius * 1.5;
    const targetX = this.flockCenter.x + Math.cos(this.patrolAngle) * patrolRadius;
    const targetY = this.flockCenter.y + Math.sin(this.patrolAngle) * patrolRadius;

    this.seekTarget({ x: targetX, y: targetY }, 0.5);
    this.wander(0.2);

    if (this.stateTimer > 2 + Math.random() * 2) {
      this.enterState('scanning');
    }
  }

  protected updateHunting(_dt: number, birdArrays: BirdArrays): void {
    if (!this.isTargetValid(birdArrays)) {
      this.enterState('scanning');
      return;
    }

    // Update target position with prediction
    const predicted = this.predictTargetPosition(birdArrays, 0.3);
    if (predicted) {
      this.target!.x = predicted.x;
      this.target!.y = predicted.y;
    }

    // Swoop attack - increase speed as we close in
    const dist = this.position.dist(this.target!);
    const speedMult = 1.0 + (1 - dist / this.panicRadius) * 0.3;
    this.seekTarget(this.target!, speedMult);

    if (dist < 25) {
      this.enterState('attacking');
    }

    if (dist > this.panicRadius * 2.5) {
      this.failedHunts++;
      this.enterState('recovering');
    }
  }
}

// ============================================================================
// FALCON - Stoop Diver
// Gains altitude, then performs high-speed diving attack
// ============================================================================

class FalconPredator extends BasePredator {
  private diveSpeed: number = 0;
  private stoopStartPos: Vector2 = new Vector2();

  constructor(
    id: number, type: PredatorType, x: number, y: number,
    stats: IPredatorStats, maxSpeed: number, panicRadius: number, color: number
  ) {
    super(id, type, x, y, stats, maxSpeed, panicRadius, color);
    this.baseAttackSuccessRate = 0.75; // High success when stoop is executed
    
    // Falcon-specific physics: very fast, less agile at high speed
    this.physics.acceleration = 25;
    this.physics.agility = 0.06; // Less agile during high-speed dive
    this.physics.turnRadiusFactor = 0.4; // Wide turn radius at speed
    this.physics.drag = 0.015; // Streamlined for speed
  }

  protected scoreBird(birdIndex: number, birdArrays: BirdArrays): ITargetScore {
    const bx = birdArrays.positionX[birdIndex];
    const by = birdArrays.positionY[birdIndex];
    const dist = this.position.dist({ x: bx, y: by });

    const density = birdArrays.localDensity[birdIndex];
    const isolationScore = 1 - density;

    // Calculate intercept score based on velocity prediction
    const vx = birdArrays.velocityX[birdIndex];
    const vy = birdArrays.velocityY[birdIndex];
    const futureX = bx + vx * 0.8;
    const futureY = by + vy * 0.8;
    const futureDist = this.position.dist({ x: futureX, y: futureY });
    const interceptScore = 1 - Math.min(futureDist / (this.panicRadius * 2), 1);

    // Prefer targets moving away (good for stoop angle)
    const toTargetX = bx - this.position.x;
    const toTargetY = by - this.position.y;
    const targetSpeed = Math.sqrt(vx * vx + vy * vy);
    let movingAwayScore = 0.5;
    if (targetSpeed > 0.1) {
      const dot = (toTargetX * vx + toTargetY * vy) / (dist * targetSpeed);
      movingAwayScore = Math.max(0, dot); // Higher if moving away from falcon
    }

    const totalScore = (
      isolationScore * 0.25 +
      interceptScore * 0.40 +
      movingAwayScore * 0.20 +
      (1 - Math.min(dist / this.panicRadius, 1)) * 0.15
    );

    return {
      birdId: birdIndex,
      position: { x: bx, y: by },
      isolationScore,
      edgeScore: isolationScore * 0.5,
      velocityScore: interceptScore,
      panicScore: 1 - birdArrays.panicLevel[birdIndex],
      interceptScore,
      totalScore
    };
  }

  protected updateScanning(_dt: number, birdArrays: BirdArrays): void {
    this.velocity.mult(0.97);
    this.wander(0.2);

    const target = this.findTarget(birdArrays);

    if (target && target.totalScore > 0.35) {
      this.targetBirdId = target.birdId;
      this.target = new Vector2(target.position.x, target.position.y);
      this.stoopStartPos.copy(this.position);
      this.enterState('ascending'); // Gain altitude first
    } else if (this.stateTimer > 3) {
      this.enterState('idle');
    }
  }

  protected updateAscending(_dt: number, birdArrays: BirdArrays): void {
    if (!this.isTargetValid(birdArrays)) {
      this.enterState('scanning');
      return;
    }

    // Update target tracking
    this.target!.x = birdArrays.positionX[this.targetBirdId];
    this.target!.y = birdArrays.positionY[this.targetBirdId];

    // Move away and upward (perpendicular to target direction)
    const dx = this.position.x - this.target!.x;
    const dy = this.position.y - this.target!.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 0) {
      // Move perpendicular to gain "altitude" and distance
      const perpX = -dy / dist;
      const perpY = dx / dist;
      const awayX = dx / dist;
      const awayY = dy / dist;

      this.tempVec.set(
        (awayX * 0.6 + perpX * 0.4) * this.maxSpeed * 0.7,
        (awayY * 0.6 + perpY * 0.4) * this.maxSpeed * 0.7
      );
      this.velocity.lerp(this.tempVec, 0.06);
    }

    // Ready to stoop when we have enough distance
    if (this.stateTimer > 2.0 && dist > this.panicRadius * 1.2) {
      this.diveSpeed = this.maxSpeed * 0.5;
      this.enterState('diving');
    }

    // Give up if target too far
    if (dist > this.panicRadius * 4) {
      this.enterState('scanning');
    }
  }

  protected updateDiving(dt: number, birdArrays: BirdArrays): void {
    if (!this.isTargetValid(birdArrays)) {
      this.diveSpeed = 0;
      this.enterState('scanning');
      return;
    }

    // Accelerate during dive - exponential increase for realistic stoop
    this.diveSpeed = Math.min(
      this.diveSpeed + dt * 30 * (1 + this.diveSpeed / this.maxSpeed),
      this.maxSpeed * this.stats.burstMultiplier
    );

    // Predict target position with intercept
    const predicted = this.predictTargetPosition(birdArrays, 0.4);
    if (predicted) {
      this.target!.x = predicted.x;
      this.target!.y = predicted.y;
    }

    // Use burst for explosive attack - falcon commits fully to the dive
    this.burst(this.target!, this.diveSpeed / (this.maxSpeed * this.stats.burstMultiplier));

    const dist = this.position.dist(this.target!);

    if (dist < 30) {
      this.diveSpeed = 0;
      this.enterState('attacking');
    } else if (dist > this.panicRadius * 3 || this.stateTimer > 4) {
      // Miss - long recovery
      this.diveSpeed = 0;
      this.failedHunts++;
      this.enterState('recovering');
    }
  }

  protected updateRecovering(dt: number): void {
    this.recoveryTimer += dt;
    this.velocity.mult(0.93);
    this.wander(0.15);

    // Longer recovery after stoop
    this.energy = Math.min(this.stats.maxEnergy, this.energy + this.stats.energyRegenRate * dt * 1.5);

    if (this.recoveryTimer > this.stats.staminaRecoveryDelay) {
      this.recoveryTimer = 0;
      this.target = null;
      this.targetBirdId = -1;
      this.enterState('idle');
    }
  }
}

// ============================================================================
// EAGLE - Sustained Pursuit
// Patient hunter, targets tired/weak prey, persistent pursuit
// ============================================================================

class EaglePredator extends BasePredator {
  private previousTargetId: number = -1;
  private targetSwitchPenalty: number = 0;

  constructor(
    id: number, type: PredatorType, x: number, y: number,
    stats: IPredatorStats, maxSpeed: number, panicRadius: number, color: number
  ) {
    super(id, type, x, y, stats, maxSpeed, panicRadius, color);
    this.baseAttackSuccessRate = 0.55; // Lower base, but high on exhausted targets
    
    // Eagle physics: heavy, powerful, excellent endurance soaring
    this.physics.acceleration = 12;
    this.physics.agility = 0.08;
    this.physics.turnRadiusFactor = 0.35; // Wide turns
    this.physics.glideFactor = 0.98; // Excellent soaring
    this.physics.drag = 0.015;
  }

  protected scoreBird(birdIndex: number, birdArrays: BirdArrays): ITargetScore {
    const bx = birdArrays.positionX[birdIndex];
    const by = birdArrays.positionY[birdIndex];
    const dist = this.position.dist({ x: bx, y: by });

    // Eagle heavily prioritizes low-energy (tired) birds
    const energy = birdArrays.energy[birdIndex];
    const energyScore = 1 - energy; // Higher score for lower energy

    const density = birdArrays.localDensity[birdIndex];
    const isolationScore = 1 - density * 0.7;

    const distScore = 1 - Math.min(dist / (this.panicRadius * 2.5), 1);

    // Persistence bonus - prefer current target
    let persistenceBonus = 0;
    if (birdIndex === this.targetBirdId) {
      persistenceBonus = Math.min(this.targetLockTime * 0.15, 0.4);
    }

    // Penalty for switching targets
    const switchPenalty = birdIndex !== this.previousTargetId && this.previousTargetId >= 0 ? 
      this.targetSwitchPenalty * 0.1 : 0;

    const totalScore = (
      energyScore * 0.45 +
      isolationScore * 0.20 +
      distScore * 0.20 +
      persistenceBonus - switchPenalty
    );

    return {
      birdId: birdIndex,
      position: { x: bx, y: by },
      isolationScore,
      edgeScore: isolationScore,
      velocityScore: energyScore,
      panicScore: 1,
      interceptScore: distScore,
      totalScore
    };
  }

  protected updateScanning(_dt: number, birdArrays: BirdArrays): void {
    // Glide slowly while scanning - conserve energy
    this.velocity.mult(0.96);
    this.wander(0.15);

    const target = this.findTarget(birdArrays);

    if (target && target.totalScore > 0.3) {
      // Eagle is patient - only pursue if target looks weak
      if (target.velocityScore > 0.3) { // Target is tired
        this.previousTargetId = this.targetBirdId;
        this.targetBirdId = target.birdId;
        this.target = new Vector2(target.position.x, target.position.y);
        this.targetSwitchPenalty = 0;
        this.enterState('stalking');
      }
    }

    if (this.stateTimer > 4) {
      this.enterState('idle');
    }
  }

  protected updateStalking(_dt: number, birdArrays: BirdArrays): void {
    if (!this.isTargetValid(birdArrays)) {
      this.enterState('scanning');
      return;
    }

    this.target!.x = birdArrays.positionX[this.targetBirdId];
    this.target!.y = birdArrays.positionY[this.targetBirdId];

    // Check if target is getting tired
    const targetEnergy = birdArrays.energy[this.targetBirdId];
    
    // Follow at moderate distance
    const dist = this.position.dist(this.target!);
    
    if (dist > this.panicRadius * 0.8) {
      this.seekTarget(this.target!, 0.65);
    } else {
      // Maintain distance - pressure but don't attack yet
      this.velocity.mult(0.95);
    }

    // Transition to hunting when target is tired enough or close enough
    if (targetEnergy < 0.5 && dist < this.panicRadius * 0.7) {
      this.enterState('hunting');
    }

    // Very patient - long timeout
    if (this.stateTimer > 15 || dist > this.panicRadius * 3.5) {
      this.targetSwitchPenalty++;
      this.enterState('scanning');
    }
  }

  protected updateHunting(_dt: number, birdArrays: BirdArrays): void {
    if (!this.isTargetValid(birdArrays)) {
      this.enterState('scanning');
      return;
    }

    this.target!.x = birdArrays.positionX[this.targetBirdId];
    this.target!.y = birdArrays.positionY[this.targetBirdId];

    // Sustained pursuit at moderate speed
    this.seekTarget(this.target!, 0.85);

    const dist = this.position.dist(this.target!);

    if (dist < 30) {
      this.enterState('attacking');
    }

    // Eagle is persistent but will give up eventually
    if (dist > this.panicRadius * 3 || this.stateTimer > 20) {
      this.failedHunts++;
      this.targetSwitchPenalty++;
      this.enterState('recovering');
    }
  }

  protected calculateAttackSuccess(birdArrays: BirdArrays): number {
    const baseSuccess = super.calculateAttackSuccess(birdArrays);
    
    // Bonus for exhausted targets
    if (this.targetBirdId >= 0 && this.targetBirdId < birdArrays.count) {
      const targetEnergy = birdArrays.energy[this.targetBirdId];
      if (targetEnergy < 0.3) {
        return Math.min(baseSuccess * 1.4, 0.9);
      }
    }
    
    return baseSuccess;
  }
}

// ============================================================================
// OWL - Silent Ambush
// Waits motionless, strikes when prey comes close
// ============================================================================

class OwlPredator extends BasePredator {
  private waitTime: number = 0;

  constructor(
    id: number, type: PredatorType, x: number, y: number,
    stats: IPredatorStats, maxSpeed: number, panicRadius: number, color: number
  ) {
    super(id, type, x, y, stats, maxSpeed, panicRadius, color);
    this.baseAttackSuccessRate = 0.80; // Very high success on ambush
    
    // Owl physics: slow but highly maneuverable, silent flight
    this.physics.acceleration = 18;
    this.physics.agility = 0.15; // Very agile
    this.physics.turnRadiusFactor = 0.15; // Tight turns
    this.physics.drag = 0.01; // Silent, low drag
    this.physics.glideFactor = 0.98; // Excellent glide
  }

  protected scoreBird(birdIndex: number, birdArrays: BirdArrays): ITargetScore {
    const bx = birdArrays.positionX[birdIndex];
    const by = birdArrays.positionY[birdIndex];
    const dist = this.position.dist({ x: bx, y: by });

    // Owl strongly prefers unaware (non-panicked) targets
    const panicLevel = birdArrays.panicLevel[birdIndex];
    const unawareScore = 1 - panicLevel;

    // Closer targets are much better for ambush
    const distScore = 1 - Math.min(dist / 100, 1);

    // Check if target is moving toward us (even better)
    const vx = birdArrays.velocityX[birdIndex];
    const vy = birdArrays.velocityY[birdIndex];
    const toUs = { x: this.position.x - bx, y: this.position.y - by };
    const speed = Math.sqrt(vx * vx + vy * vy);
    let approachingScore = 0.5;
    if (speed > 0.1 && dist > 0) {
      const dot = (toUs.x * vx + toUs.y * vy) / (dist * speed);
      approachingScore = Math.max(0, Math.min(1, (dot + 1) / 2));
    }

    const totalScore = (
      unawareScore * 0.50 +
      distScore * 0.30 +
      approachingScore * 0.20
    );

    return {
      birdId: birdIndex,
      position: { x: bx, y: by },
      isolationScore: 0.5,
      edgeScore: 0.5,
      velocityScore: approachingScore,
      panicScore: unawareScore,
      interceptScore: distScore,
      totalScore
    };
  }

  protected updateIdle(_dt: number, _birdArrays: BirdArrays): void {
    // Move very slowly to find good ambush position
    this.velocity.mult(0.9);
    this.wander(0.1);

    // Look for area with bird traffic
    if (this.stateTimer > 3) {
      this.enterState('scanning');
    }
  }

  protected updateScanning(_dt: number, birdArrays: BirdArrays): void {
    // Stay very still while scanning
    this.velocity.mult(0.85);

    const target = this.findTarget(birdArrays);

    if (target && target.totalScore > 0.4) {
      this.targetBirdId = target.birdId;
      this.target = new Vector2(target.position.x, target.position.y);
      this.waitTime = 0;
      this.enterState('ambushing');
    }

    if (this.stateTimer > 5) {
      this.enterState('idle');
    }
  }

  protected updateAmbushing(dt: number, birdArrays: BirdArrays): void {
    // COMPLETELY STILL - this is key to owl ambush
    this.velocity.mult(0.7);
    this.waitTime += dt;

    if (!this.isTargetValid(birdArrays)) {
      // Look for new target while staying still
      const newTarget = this.findTarget(birdArrays);
      if (newTarget && newTarget.totalScore > 0.5) {
        this.targetBirdId = newTarget.birdId;
        this.target = new Vector2(newTarget.position.x, newTarget.position.y);
      } else if (this.waitTime > 8) {
        this.enterState('idle');
      }
      return;
    }

    this.target!.x = birdArrays.positionX[this.targetBirdId];
    this.target!.y = birdArrays.positionY[this.targetBirdId];

    const dist = this.position.dist(this.target!);

    // Strike when target is very close!
    if (dist < 45) {
      this.enterState('hunting');
    }

    // Give up if waiting too long
    if (this.waitTime > 12) {
      this.enterState('idle');
    }
  }

  protected updateHunting(_dt: number, birdArrays: BirdArrays): void {
    if (!this.isTargetValid(birdArrays)) {
      this.enterState('ambushing');
      return;
    }

    this.target!.x = birdArrays.positionX[this.targetBirdId];
    this.target!.y = birdArrays.positionY[this.targetBirdId];

    // BURST speed attack!
    const burstSpeed = this.maxSpeed * this.stats.burstMultiplier;
    this.tempVec.copy(this.target!).sub(this.position);
    if (this.tempVec.mag() > 0) {
      this.tempVec.setMag(burstSpeed);
      this.velocity.lerp(this.tempVec, 0.25);
    }

    const dist = this.position.dist(this.target!);

    if (dist < 25) {
      this.enterState('attacking');
    }

    // Short hunting window - either get them quick or fail
    if (this.stateTimer > 2 || dist > 100) {
      this.failedHunts++;
      this.enterState('recovering');
    }
  }

  protected calculateAttackSuccess(birdArrays: BirdArrays): number {
    // Owl ambush has very high success if target wasn't panicked
    if (this.targetBirdId >= 0 && this.targetBirdId < birdArrays.count) {
      const targetPanic = birdArrays.panicLevel[this.targetBirdId];
      if (targetPanic < 0.3) {
        return 0.85; // Near-guaranteed on unaware target
      }
    }
    return super.calculateAttackSuccess(birdArrays);
  }
}

// ============================================================================
// SHARK - Circling Hunter
// Circles prey school, gradually tightens, strikes from below
// ============================================================================

class SharkPredator extends BasePredator {
  private circleAngle: number = 0;
  private circleRadius: number = 0;
  private baseCircleRadius: number = 0;
  private bumpCount: number = 0;

  constructor(
    id: number, type: PredatorType, x: number, y: number,
    stats: IPredatorStats, maxSpeed: number, panicRadius: number, color: number
  ) {
    super(id, type, x, y, stats, maxSpeed, panicRadius, color);
    this.baseAttackSuccessRate = 0.60;
    this.baseCircleRadius = panicRadius * 1.2;
    this.circleRadius = this.baseCircleRadius;
    
    // Shark physics: powerful but not as maneuverable, water resistance
    this.physics.acceleration = 10;
    this.physics.agility = 0.10;
    this.physics.turnRadiusFactor = 0.25; // Medium turn radius
    this.physics.drag = 0.05; // More water resistance
    this.physics.deceleration = 4; // Slow to stop
  }

  protected scoreBird(birdIndex: number, birdArrays: BirdArrays): ITargetScore {
    const bx = birdArrays.positionX[birdIndex];
    const by = birdArrays.positionY[birdIndex];
    const dist = this.position.dist({ x: bx, y: by });

    const density = birdArrays.localDensity[birdIndex];
    const edgeScore = 1 - density;

    const distScore = 1 - Math.min(dist / this.panicRadius, 1);

    // Shark targets edge of school
    const totalScore = edgeScore * 0.55 + distScore * 0.45;

    return {
      birdId: birdIndex,
      position: { x: bx, y: by },
      isolationScore: edgeScore,
      edgeScore,
      velocityScore: 0.5,
      panicScore: 0.5,
      interceptScore: distScore,
      totalScore
    };
  }

  protected updateIdle(_dt: number, _birdArrays: BirdArrays): void {
    this.wander(0.4);

    if (this.stateTimer > 2) {
      this.enterState('scanning');
    }
  }

  protected updateScanning(_dt: number, birdArrays: BirdArrays): void {
    this.velocity.mult(0.97);

    // Look for school center
    const flockCenter = this.calculateFlockCenter(birdArrays);
    const target = this.findTarget(birdArrays);

    if (target && target.totalScore > 0.3) {
      this.targetBirdId = target.birdId;
      this.target = new Vector2(flockCenter.x, flockCenter.y);
      this.circleAngle = Math.atan2(
        this.position.y - flockCenter.y,
        this.position.x - flockCenter.x
      );
      this.circleRadius = this.baseCircleRadius;
      this.bumpCount = 0;
      this.enterState('circling');
    }

    if (this.stateTimer > 3) {
      this.enterState('idle');
    }
  }

  protected updateCircling(dt: number, birdArrays: BirdArrays): void {
    // Update flock center
    const flockCenter = this.calculateFlockCenter(birdArrays);
    this.target = new Vector2(flockCenter.x, flockCenter.y);

    // Gradually tighten circle
    this.circleRadius = Math.max(
      this.panicRadius * 0.5,
      this.baseCircleRadius - this.stateTimer * 8
    );

    // Orbit speed increases as circle tightens
    const orbitSpeed = 0.4 + (1 - this.circleRadius / this.baseCircleRadius) * 0.3;
    this.circleAngle += orbitSpeed * dt;

    const targetX = this.target.x + Math.cos(this.circleAngle) * this.circleRadius;
    const targetY = this.target.y + Math.sin(this.circleAngle) * this.circleRadius;

    this.seekTarget({ x: targetX, y: targetY }, 0.8);

    // Find closest bird on edge
    let closestDist = Infinity;
    let closestId = -1;
    for (let i = 0; i < birdArrays.count; i++) {
      const bx = birdArrays.positionX[i];
      const by = birdArrays.positionY[i];
      const d = this.position.dist({ x: bx, y: by });
      if (d < closestDist && birdArrays.localDensity[i] < 0.5) {
        closestDist = d;
        closestId = i;
      }
    }

    if (closestId >= 0) {
      this.targetBirdId = closestId;
    }

    // Strike when circle is tight enough
    if (this.circleRadius < this.panicRadius * 0.6 && closestDist < 80) {
      this.enterState('hunting');
    }

    if (this.stateTimer > 12) {
      this.enterState('scanning');
    }
  }

  protected updateHunting(_dt: number, birdArrays: BirdArrays): void {
    if (!this.isTargetValid(birdArrays)) {
      this.enterState('circling');
      return;
    }

    // Burst attack from circle
    this.target!.x = birdArrays.positionX[this.targetBirdId];
    this.target!.y = birdArrays.positionY[this.targetBirdId];

    const burstSpeed = this.maxSpeed * this.stats.burstMultiplier;
    this.tempVec.copy(this.target!).sub(this.position);
    if (this.tempVec.mag() > 0) {
      this.tempVec.setMag(burstSpeed);
      this.velocity.lerp(this.tempVec, 0.15);
    }

    const dist = this.position.dist(this.target!);

    if (dist < 30) {
      this.enterState('attacking');
    }

    if (this.stateTimer > 3) {
      this.bumpCount++;
      if (this.bumpCount > 2) {
        this.failedHunts++;
        this.enterState('recovering');
      } else {
        // Return to circling for another attempt
        this.enterState('circling');
      }
    }
  }
}

// ============================================================================
// ORCA - Pack Hunter
// Coordinates with other orcas, herds prey, carousel feeding
// ============================================================================

class OrcaPredator extends BasePredator {
  private assignedSector: number = 0;

  constructor(
    id: number, type: PredatorType, x: number, y: number,
    stats: IPredatorStats, maxSpeed: number, panicRadius: number, color: number
  ) {
    super(id, type, x, y, stats, maxSpeed, panicRadius, color);
    this.baseAttackSuccessRate = 0.70; // Pack coordination = high success
    
    // Orca physics: large, powerful, moderately maneuverable
    this.physics.acceleration = 14;
    this.physics.agility = 0.09;
    this.physics.turnRadiusFactor = 0.28;
    this.physics.drag = 0.04;
    this.physics.deceleration = 5;
  }

  protected scoreBird(birdIndex: number, birdArrays: BirdArrays): ITargetScore {
    const bx = birdArrays.positionX[birdIndex];
    const by = birdArrays.positionY[birdIndex];
    const dist = this.position.dist({ x: bx, y: by });

    const density = birdArrays.localDensity[birdIndex];
    const edgeScore = 1 - density;

    // Check if prey is cornered (near pack center)
    let corneredScore = 0;
    if (this.packCoordinator) {
      const packCenter = this.packCoordinator.getPackCenter();
      const distToCenter = Math.sqrt(
        (bx - packCenter.x) ** 2 + (by - packCenter.y) ** 2
      );
      corneredScore = 1 - Math.min(distToCenter / 150, 1);
    }

    const distScore = 1 - Math.min(dist / this.panicRadius, 1);

    const totalScore = (
      edgeScore * 0.30 +
      corneredScore * 0.40 +
      distScore * 0.30
    );

    return {
      birdId: birdIndex,
      position: { x: bx, y: by },
      isolationScore: edgeScore,
      edgeScore,
      velocityScore: corneredScore,
      panicScore: 0.5,
      interceptScore: distScore,
      totalScore
    };
  }

  protected updateIdle(_dt: number, _birdArrays: BirdArrays): void {
    this.wander(0.3);

    // Calculate assigned sector based on pack
    if (this.packCoordinator) {
      this.assignedSector = this.packCoordinator.getAssignedSector(this.id);
    }

    if (this.stateTimer > 2) {
      this.enterState('scanning');
    }
  }

  protected updateScanning(_dt: number, birdArrays: BirdArrays): void {
    this.velocity.mult(0.97);

    const target = this.findTarget(birdArrays);

    if (target && target.totalScore > 0.25) {
      this.targetBirdId = target.birdId;
      this.target = new Vector2(target.position.x, target.position.y);
      
      // Orca goes to herding mode first (pack coordination)
      if (this.packCoordinator) {
        this.enterState('herding');
      } else {
        this.enterState('stalking');
      }
    }

    if (this.stateTimer > 3) {
      this.enterState('idle');
    }
  }

  protected updateHerding(_dt: number, birdArrays: BirdArrays): void {
    if (!this.isTargetValid(birdArrays)) {
      this.enterState('scanning');
      return;
    }

    // Position based on assigned sector
    const flockCenter = this.calculateFlockCenter(birdArrays);
    const sectorAngle = (this.assignedSector * Math.PI * 2) / 4; // Divide into sectors
    const herdRadius = this.panicRadius * 1.3;

    const herdX = flockCenter.x + Math.cos(sectorAngle) * herdRadius;
    const herdY = flockCenter.y + Math.sin(sectorAngle) * herdRadius;

    this.seekTarget({ x: herdX, y: herdY }, 0.7);

    // Occasional patrol within sector
    this.wander(0.1);

    // Check if attack slot available
    if (this.stateTimer > 3) {
      if (this.packCoordinator && this.packCoordinator.isAttackSlotAvailable()) {
        if (this.packCoordinator.claimAttackSlot(this.id)) {
          this.enterState('hunting');
        }
      }
    }

    if (this.stateTimer > 10) {
      this.enterState('scanning');
    }
  }

  protected updateHunting(_dt: number, birdArrays: BirdArrays): void {
    if (!this.isTargetValid(birdArrays)) {
      this.packCoordinator?.releaseAttackSlot(this.id);
      this.enterState('scanning');
      return;
    }

    this.target!.x = birdArrays.positionX[this.targetBirdId];
    this.target!.y = birdArrays.positionY[this.targetBirdId];

    // Fast coordinated attack
    this.seekTarget(this.target!, 1.1);

    const dist = this.position.dist(this.target!);

    if (dist < 35) {
      this.enterState('attacking');
    }

    if (this.stateTimer > 4) {
      this.packCoordinator?.releaseAttackSlot(this.id);
      this.failedHunts++;
      this.enterState('herding');
    }
  }

  protected updateRecovering(dt: number): void {
    this.packCoordinator?.releaseAttackSlot(this.id);
    super.updateRecovering(dt);
  }
}

// ============================================================================
// BARRACUDA - Burst Attacker
// Waits still, then explosive burst attack, can chain strikes
// ============================================================================

class BarracudaPredator extends BasePredator {
  private chainStrikes: number = 0;
  private maxChainStrikes: number = 3;
  private burstTimer: number = 0;

  constructor(
    id: number, type: PredatorType, x: number, y: number,
    stats: IPredatorStats, maxSpeed: number, panicRadius: number, color: number
  ) {
    super(id, type, x, y, stats, maxSpeed, panicRadius, color);
    this.baseAttackSuccessRate = 0.55; // Lower base, relies on surprise
    
    // Barracuda physics: extremely fast acceleration, moderate agility
    this.physics.acceleration = 35; // Explosive acceleration
    this.physics.agility = 0.12;
    this.physics.turnRadiusFactor = 0.18; // Decent turning
    this.physics.drag = 0.06; // Elongated body has some drag
    this.physics.deceleration = 8; // Quick to stop for ambush
  }

  protected scoreBird(birdIndex: number, birdArrays: BirdArrays): ITargetScore {
    const bx = birdArrays.positionX[birdIndex];
    const by = birdArrays.positionY[birdIndex];
    const dist = this.position.dist({ x: bx, y: by });

    // Barracuda prefers confused/scattered fish
    const panicLevel = birdArrays.panicLevel[birdIndex];
    const confusionScore = panicLevel * 0.7 + (1 - birdArrays.localDensity[birdIndex]) * 0.3;

    const distScore = 1 - Math.min(dist / 80, 1);

    // Prefer targets moving perpendicular (easier to intercept)
    const vx = birdArrays.velocityX[birdIndex];
    const vy = birdArrays.velocityY[birdIndex];
    const toTarget = { x: bx - this.position.x, y: by - this.position.y };
    const speed = Math.sqrt(vx * vx + vy * vy);
    let perpScore = 0.5;
    if (speed > 0.1 && dist > 0) {
      const dot = Math.abs(toTarget.x * vx + toTarget.y * vy) / (dist * speed);
      perpScore = 1 - dot; // Higher score for perpendicular movement
    }

    const totalScore = (
      confusionScore * 0.35 +
      distScore * 0.40 +
      perpScore * 0.25
    );

    return {
      birdId: birdIndex,
      position: { x: bx, y: by },
      isolationScore: 1 - birdArrays.localDensity[birdIndex],
      edgeScore: 0.5,
      velocityScore: perpScore,
      panicScore: panicLevel,
      interceptScore: distScore,
      totalScore
    };
  }

  protected updateIdle(_dt: number, _birdArrays: BirdArrays): void {
    // Barracuda stays very still when idle - stealth mode
    this.velocity.mult(0.85);
    this.chainStrikes = 0;

    if (this.stateTimer > 2) {
      this.enterState('scanning');
    }
  }

  protected updateScanning(_dt: number, birdArrays: BirdArrays): void {
    // Stay still while scanning
    this.velocity.mult(0.9);

    const target = this.findTarget(birdArrays);

    if (target && target.totalScore > 0.35) {
      this.targetBirdId = target.birdId;
      this.target = new Vector2(target.position.x, target.position.y);
      this.burstTimer = 0;
      this.enterState('stalking');
    }

    if (this.stateTimer > 4) {
      this.enterState('idle');
    }
  }

  protected updateStalking(_dt: number, birdArrays: BirdArrays): void {
    // Wait for target to get close
    this.velocity.mult(0.85);

    if (!this.isTargetValid(birdArrays)) {
      this.enterState('scanning');
      return;
    }

    this.target!.x = birdArrays.positionX[this.targetBirdId];
    this.target!.y = birdArrays.positionY[this.targetBirdId];

    const dist = this.position.dist(this.target!);

    // BURST when close enough
    if (dist < this.panicRadius * 0.8) {
      this.burstTimer = 0;
      this.enterState('hunting');
    }

    if (this.stateTimer > 6 || dist > this.panicRadius * 2) {
      this.enterState('scanning');
    }
  }

  protected updateHunting(dt: number, birdArrays: BirdArrays): void {
    if (!this.isTargetValid(birdArrays)) {
      this.enterState('scanning');
      return;
    }

    this.burstTimer += dt;
    
    // Intercept prediction for moving target
    const predicted = this.predictTargetPosition(birdArrays, 0.2);
    if (predicted) {
      this.target!.x = predicted.x;
      this.target!.y = predicted.y;
    }

    // Use explosive burst physics for barracuda's lightning attack
    this.burst(this.target!, 1.0);

    const dist = this.position.dist(this.target!);

    if (dist < 25) {
      this.enterState('attacking');
    }

    // Burst is short - hit or miss quickly
    if (this.burstTimer > 1.5) {
      this.failedHunts++;
      if (this.energy > 0.4 && this.chainStrikes < this.maxChainStrikes) {
        // Chain to another target
        this.chainStrikes++;
        this.enterState('scanning');
      } else {
        this.enterState('recovering');
      }
    }
  }

  protected updateAttacking(_dt: number, birdArrays: BirdArrays): void {
    if (this.stateTimer > 0.3) {
      this.energy = Math.max(0, this.energy - this.stats.attackCost);

      const successChance = this.calculateAttackSuccess(birdArrays);
      
      if (Math.random() < successChance) {
        this.successfulHunts++;
        this.energy = Math.min(this.stats.maxEnergy, this.energy + 0.25);
      } else {
        this.failedHunts++;
      }

      // Chain strike if energy allows
      if (this.energy > 0.35 && this.chainStrikes < this.maxChainStrikes) {
        this.chainStrikes++;
        this.enterState('scanning');
      } else {
        this.chainStrikes = 0;
        this.enterState('recovering');
      }
    }
  }
}

// ============================================================================
// SEA LION - Agile Pursuer
// High maneuverability, persistent chase, herds to corners
// ============================================================================

class SeaLionPredator extends BasePredator {
  private pursuitTime: number = 0;
  private lastTargetId: number = -1;
  private targetSwitchCount: number = 0;

  constructor(
    id: number, type: PredatorType, x: number, y: number,
    stats: IPredatorStats, maxSpeed: number, panicRadius: number, color: number
  ) {
    super(id, type, x, y, stats, maxSpeed, panicRadius, color);
    this.baseAttackSuccessRate = 0.60;
    
    // Sea Lion physics: agile, playful, high endurance
    this.physics.acceleration = 16;
    this.physics.agility = 0.14; // Very maneuverable
    this.physics.turnRadiusFactor = 0.18;
    this.physics.drag = 0.035;
    this.physics.glideFactor = 0.94;
  }

  protected scoreBird(birdIndex: number, birdArrays: BirdArrays): ITargetScore {
    const bx = birdArrays.positionX[birdIndex];
    const by = birdArrays.positionY[birdIndex];
    const dist = this.position.dist({ x: bx, y: by });

    const density = birdArrays.localDensity[birdIndex];
    const isolationScore = 1 - density;

    // Prefer current target (persistence)
    let persistenceBonus = 0;
    if (birdIndex === this.targetBirdId && this.pursuitTime > 1) {
      persistenceBonus = Math.min(this.pursuitTime * 0.1, 0.3);
    }

    // Prefer tired prey
    const energyScore = 1 - birdArrays.energy[birdIndex];

    const distScore = 1 - Math.min(dist / this.panicRadius, 1);

    const totalScore = (
      isolationScore * 0.25 +
      energyScore * 0.25 +
      distScore * 0.30 +
      persistenceBonus
    );

    return {
      birdId: birdIndex,
      position: { x: bx, y: by },
      isolationScore,
      edgeScore: isolationScore,
      velocityScore: energyScore,
      panicScore: 0.5,
      interceptScore: distScore,
      totalScore
    };
  }

  protected updateIdle(_dt: number, _birdArrays: BirdArrays): void {
    // Playful movement
    this.wander(0.5);

    // Erratic direction changes
    if (Math.random() < 0.02) {
      this.velocity.rotate((Math.random() - 0.5) * Math.PI * 0.5);
    }

    if (this.stateTimer > 2) {
      this.enterState('scanning');
    }
  }

  protected updateScanning(_dt: number, birdArrays: BirdArrays): void {
    this.wander(0.3);

    const target = this.findTarget(birdArrays);

    if (target && target.totalScore > 0.3) {
      if (target.birdId !== this.lastTargetId) {
        this.targetSwitchCount++;
      }
      this.lastTargetId = target.birdId;
      this.targetBirdId = target.birdId;
      this.target = new Vector2(target.position.x, target.position.y);
      this.pursuitTime = 0;
      this.enterState('hunting');
    }

    if (this.stateTimer > 3) {
      this.enterState('idle');
    }
  }

  protected updateHunting(dt: number, birdArrays: BirdArrays): void {
    if (!this.isTargetValid(birdArrays)) {
      this.enterState('scanning');
      return;
    }

    this.pursuitTime += dt;

    // Predict target position
    const predicted = this.predictTargetPosition(birdArrays, 0.35);
    if (predicted) {
      this.target!.x = predicted.x;
      this.target!.y = predicted.y;
    }

    // High maneuverability - aggressive lerp
    this.tempVec.copy(this.target!).sub(this.position);
    const dist = this.tempVec.mag();

    if (dist > 0) {
      this.tempVec.setMag(this.maxSpeed);
      this.velocity.lerp(this.tempVec, 0.18); // Very responsive turning
    }

    // Occasional erratic burst
    if (Math.random() < 0.03) {
      this.velocity.rotate((Math.random() - 0.5) * 0.3);
      this.velocity.mult(1.15);
    }

    if (dist < 30) {
      this.enterState('attacking');
    }

    // Persistent but will eventually give up
    if (dist > this.panicRadius * 2.5 || this.pursuitTime > 12) {
      this.failedHunts++;
      this.enterState('recovering');
    }
  }

  protected calculateAttackSuccess(birdArrays: BirdArrays): number {
    const baseSuccess = super.calculateAttackSuccess(birdArrays);
    
    // Bonus for persistent pursuit (target is exhausted)
    if (this.pursuitTime > 5) {
      return Math.min(baseSuccess * 1.25, 0.85);
    }
    
    return baseSuccess;
  }
}

// ============================================================================
// Pack Coordinator for Orcas
// ============================================================================

class OrcaPackCoordinator implements IPackCoordinator {
  private members: OrcaPredator[] = [];
  private attackSlot: number = -1;

  addMember(orca: OrcaPredator): void {
    this.members.push(orca);
    orca.setPackCoordinator(this);
  }

  getPackMembers(): BasePredator[] {
    return this.members;
  }

  getPackCenter(): IVector2 {
    if (this.members.length === 0) {
      return { x: 0, y: 0 };
    }

    let sumX = 0, sumY = 0;
    for (const m of this.members) {
      sumX += m.position.x;
      sumY += m.position.y;
    }
    return {
      x: sumX / this.members.length,
      y: sumY / this.members.length
    };
  }

  getAssignedSector(predatorId: number): number {
    const idx = this.members.findIndex(m => m.id === predatorId);
    return idx >= 0 ? idx % 4 : 0;
  }

  isAttackSlotAvailable(): boolean {
    return this.attackSlot < 0;
  }

  claimAttackSlot(predatorId: number): boolean {
    if (this.attackSlot < 0) {
      this.attackSlot = predatorId;
      return true;
    }
    return false;
  }

  releaseAttackSlot(predatorId: number): void {
    if (this.attackSlot === predatorId) {
      this.attackSlot = -1;
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

// Track orca packs for coordination
const orcaPacks: Map<string, OrcaPackCoordinator> = new Map();

/**
 * Factory to create predator instances.
 */
export function createPredator(
  id: number,
  type: PredatorType,
  x: number,
  y: number,
  preset?: IPredatorPreset,
  packId?: string
): BasePredator {
  const stats = PREDATOR_STATS[type];
  const p = preset || DEFAULT_PRESETS[type];

  switch (type) {
    case 'hawk':
      return new HawkPredator(id, type, x, y, stats, p.maxSpeed, p.panicRadius, p.color);
    
    case 'falcon':
      return new FalconPredator(id, type, x, y, stats, p.maxSpeed, p.panicRadius, p.color);
    
    case 'eagle':
      return new EaglePredator(id, type, x, y, stats, p.maxSpeed, p.panicRadius, p.color);
    
    case 'owl':
      return new OwlPredator(id, type, x, y, stats, p.maxSpeed, p.panicRadius, p.color);
    
    case 'shark':
      return new SharkPredator(id, type, x, y, stats, p.maxSpeed, p.panicRadius, p.color);
    
    case 'orca': {
      const orca = new OrcaPredator(id, type, x, y, stats, p.maxSpeed, p.panicRadius, p.color);
      // Set up pack coordination
      const pid = packId || 'default';
      if (!orcaPacks.has(pid)) {
        orcaPacks.set(pid, new OrcaPackCoordinator());
      }
      orcaPacks.get(pid)!.addMember(orca);
      return orca;
    }
    
    case 'barracuda':
      return new BarracudaPredator(id, type, x, y, stats, p.maxSpeed, p.panicRadius, p.color);
    
    case 'sea-lion':
      return new SeaLionPredator(id, type, x, y, stats, p.maxSpeed, p.panicRadius, p.color);
    
    default:
      return new HawkPredator(id, 'hawk', x, y, PREDATOR_STATS.hawk, DEFAULT_PRESETS.hawk.maxSpeed, DEFAULT_PRESETS.hawk.panicRadius, DEFAULT_PRESETS.hawk.color);
  }
}

/**
 * Clear orca packs (call on reset).
 */
export function clearOrcaPacks(): void {
  orcaPacks.clear();
}

export { BasePredator };
