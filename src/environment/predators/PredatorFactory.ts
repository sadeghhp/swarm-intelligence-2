import { BasePredator } from './BasePredator';
import type {
  PredatorType,
  IPredatorStats,
  ITargetScore,
  IPredatorPreset
} from '../../types';
import type { BirdArrays } from '../../simulation/Bird';

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
    burstMultiplier: 1.8,
    staminaRecoveryDelay: 4
  },
  eagle: {
    maxEnergy: 1.2,
    energyRegenRate: 0.06,
    huntingDrain: 0.08,
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
    burstMultiplier: 1.5,
    staminaRecoveryDelay: 5
  },
  shark: {
    maxEnergy: 1.0,
    energyRegenRate: 0.04,
    huntingDrain: 0.12,
    attackCost: 0.3,
    exhaustionThreshold: 0.2,
    burstMultiplier: 1.4,
    staminaRecoveryDelay: 3.5
  },
  orca: {
    maxEnergy: 1.5,
    energyRegenRate: 0.03,
    huntingDrain: 0.1,
    attackCost: 0.25,
    exhaustionThreshold: 0.2,
    burstMultiplier: 1.3,
    staminaRecoveryDelay: 3
  },
  barracuda: {
    maxEnergy: 0.7,
    energyRegenRate: 0.08,
    huntingDrain: 0.2,
    attackCost: 0.35,
    exhaustionThreshold: 0.15,
    burstMultiplier: 2.0,
    staminaRecoveryDelay: 2
  },
  'sea-lion': {
    maxEnergy: 1.1,
    energyRegenRate: 0.05,
    huntingDrain: 0.09,
    attackCost: 0.28,
    exhaustionThreshold: 0.22,
    burstMultiplier: 1.25,
    staminaRecoveryDelay: 3.5
  }
};

const DEFAULT_PRESETS: Record<PredatorType, IPredatorPreset> = {
  hawk: { name: 'Hawk', maxSpeed: 18, panicRadius: 120, huntingStyle: 'edge', color: 0xcc6600 },
  falcon: { name: 'Falcon', maxSpeed: 25, panicRadius: 180, huntingStyle: 'stoop', color: 0x8844aa },
  eagle: { name: 'Eagle', maxSpeed: 16, panicRadius: 150, huntingStyle: 'sustained', color: 0x886622 },
  owl: { name: 'Owl', maxSpeed: 12, panicRadius: 80, huntingStyle: 'ambush', color: 0x444466 },
  shark: { name: 'Shark', maxSpeed: 14, panicRadius: 100, huntingStyle: 'circling', color: 0x445566 },
  orca: { name: 'Orca', maxSpeed: 15, panicRadius: 140, huntingStyle: 'pack', color: 0x222222 },
  barracuda: { name: 'Barracuda', maxSpeed: 22, panicRadius: 90, huntingStyle: 'burst', color: 0x667788 },
  'sea-lion': { name: 'Sea Lion', maxSpeed: 13, panicRadius: 110, huntingStyle: 'sustained', color: 0x554433 }
};

// ============================================================================
// Specialized Predator Classes
// ============================================================================

/**
 * Hawk - targets edge birds
 */
class HawkPredator extends BasePredator {
  protected scoreBird(birdIndex: number, birdArrays: BirdArrays): ITargetScore {
    const bx = birdArrays.positionX[birdIndex];
    const by = birdArrays.positionY[birdIndex];
    const dist = this.position.dist({ x: bx, y: by });

    // Calculate isolation (birds with fewer neighbors score higher)
    const density = birdArrays.localDensity[birdIndex];
    const isolationScore = 1 - density;

    // Edge detection (distance from center of flock)
    const edgeScore = isolationScore * 0.8;

    // Velocity alignment (easier to catch slower birds)
    const speed = Math.sqrt(
      birdArrays.velocityX[birdIndex] ** 2 +
      birdArrays.velocityY[birdIndex] ** 2
    );
    const velocityScore = 1 - Math.min(speed / 20, 1);

    // Panic score (already panicked birds are harder to catch - they're alert)
    const panicScore = 1 - birdArrays.panicLevel[birdIndex];

    // Distance factor
    const distanceFactor = 1 - Math.min(dist / (this.panicRadius * 2), 1);

    const totalScore = (
      isolationScore * 0.35 +
      edgeScore * 0.25 +
      velocityScore * 0.15 +
      panicScore * 0.15 +
      distanceFactor * 0.1
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
}

/**
 * Falcon - high-speed diving attacks
 */
class FalconPredator extends BasePredator {
  private diveSpeed: number = 0;

  protected scoreBird(birdIndex: number, birdArrays: BirdArrays): ITargetScore {
    const bx = birdArrays.positionX[birdIndex];
    const by = birdArrays.positionY[birdIndex];
    const dist = this.position.dist({ x: bx, y: by });

    // Falcon prefers targets that allow a good dive angle
    const density = birdArrays.localDensity[birdIndex];
    const isolationScore = 1 - density;

    // Calculate intercept score based on velocity prediction
    const vx = birdArrays.velocityX[birdIndex];
    const vy = birdArrays.velocityY[birdIndex];
    const futureX = bx + vx * 0.5;
    const futureY = by + vy * 0.5;
    const futureDist = this.position.dist({ x: futureX, y: futureY });
    const interceptScore = 1 - Math.min(futureDist / (this.panicRadius * 2), 1);

    const totalScore = (
      isolationScore * 0.3 +
      interceptScore * 0.5 +
      (1 - Math.min(dist / this.panicRadius, 1)) * 0.2
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

  protected updateHunting(dt: number, birdArrays: BirdArrays): void {
    if (this.targetBirdId < 0) {
      this.enterState('scanning');
      return;
    }

    // Falcon uses dive attack
    this.diveSpeed = Math.min(this.diveSpeed + dt * 10, this.maxSpeed * this.stats.burstMultiplier);

    this.target!.x = birdArrays.positionX[this.targetBirdId];
    this.target!.y = birdArrays.positionY[this.targetBirdId];

    this.seekTarget(this.target!, this.diveSpeed / this.maxSpeed);

    const dist = this.position.dist(this.target!);

    if (dist < 25) {
      this.diveSpeed = 0;
      this.enterState('attacking');
    } else if (dist > this.panicRadius * 2.5) {
      this.diveSpeed = 0;
      this.failedHunts++;
      this.enterState('recovering');
    }
  }
}

/**
 * Eagle - sustained pursuit
 */
class EaglePredator extends BasePredator {
  protected scoreBird(birdIndex: number, birdArrays: BirdArrays): ITargetScore {
    const bx = birdArrays.positionX[birdIndex];
    const by = birdArrays.positionY[birdIndex];
    const dist = this.position.dist({ x: bx, y: by });

    // Eagle prefers sustained chase - looks for tired/low-energy birds
    const energy = birdArrays.energy[birdIndex];
    const energyScore = 1 - energy;

    const density = birdArrays.localDensity[birdIndex];
    const isolationScore = 1 - density * 0.5; // Less concerned with isolation

    const distScore = 1 - Math.min(dist / (this.panicRadius * 2), 1);

    const totalScore = (
      energyScore * 0.4 +
      isolationScore * 0.3 +
      distScore * 0.3
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
}

/**
 * Owl - ambush predator
 */
class OwlPredator extends BasePredator {
  protected scoreBird(birdIndex: number, birdArrays: BirdArrays): ITargetScore {
    const bx = birdArrays.positionX[birdIndex];
    const by = birdArrays.positionY[birdIndex];
    const dist = this.position.dist({ x: bx, y: by });

    // Owl prefers unaware targets
    const panicLevel = birdArrays.panicLevel[birdIndex];
    const unawareScore = 1 - panicLevel;

    const distScore = Math.min(dist / 100, 1); // Prefers closer targets

    const totalScore = unawareScore * 0.7 + (1 - distScore) * 0.3;

    return {
      birdId: birdIndex,
      position: { x: bx, y: by },
      isolationScore: 0.5,
      edgeScore: 0.5,
      velocityScore: 0.5,
      panicScore: unawareScore,
      interceptScore: 1 - distScore,
      totalScore
    };
  }

  protected updateStalking(_dt: number, birdArrays: BirdArrays): void {
    // Owl stays very still while stalking
    this.velocity.mult(0.9);

    if (this.targetBirdId < 0 || this.targetBirdId >= birdArrays.count) {
      this.enterState('scanning');
      return;
    }

    this.target!.x = birdArrays.positionX[this.targetBirdId];
    this.target!.y = birdArrays.positionY[this.targetBirdId];

    const dist = this.position.dist(this.target!);

    // Strike when target comes close
    if (dist < 60) {
      this.enterState('hunting');
    }

    if (this.stateTimer > 8) {
      this.enterState('scanning');
    }
  }
}

/**
 * Shark - circling predator
 */
class SharkPredator extends BasePredator {
  private circleAngle: number = 0;

  protected scoreBird(birdIndex: number, birdArrays: BirdArrays): ITargetScore {
    const bx = birdArrays.positionX[birdIndex];
    const by = birdArrays.positionY[birdIndex];
    const dist = this.position.dist({ x: bx, y: by });

    const density = birdArrays.localDensity[birdIndex];
    const edgeScore = 1 - density;

    const distScore = 1 - Math.min(dist / this.panicRadius, 1);

    const totalScore = edgeScore * 0.5 + distScore * 0.5;

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

  protected updateStalking(dt: number, _birdArrays: BirdArrays): void {
    // Circle around the target
    this.circleAngle += dt * 0.5;

    if (this.target) {
      const circleRadius = this.panicRadius * 0.8;
      const circleX = this.target.x + Math.cos(this.circleAngle) * circleRadius;
      const circleY = this.target.y + Math.sin(this.circleAngle) * circleRadius;

      this.seekTarget({ x: circleX, y: circleY }, 0.7);
    }

    if (this.stateTimer > 5) {
      this.enterState('hunting');
    }
  }
}

/**
 * Factory to create predator instances.
 */
export function createPredator(
  id: number,
  type: PredatorType,
  x: number,
  y: number,
  preset?: IPredatorPreset
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
    case 'orca':
    case 'barracuda':
    case 'sea-lion':
      return new SharkPredator(id, type, x, y, stats, p.maxSpeed, p.panicRadius, p.color);
    default:
      return new HawkPredator(id, 'hawk', x, y, stats, p.maxSpeed, p.panicRadius, p.color);
  }
}

export { BasePredator };

