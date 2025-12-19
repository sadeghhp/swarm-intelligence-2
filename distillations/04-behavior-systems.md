# Behavior Systems

## Overview

The simulation includes four major behavior systems:
1. **Predator AI** - 8 predator types with unique hunting strategies
2. **Food System** - Gathering and feeding state machines
3. **Mating System** - Courtship and competition behaviors
4. **Energy System** - Resource management affecting movement

---

## Predator AI System

### Architecture

```
BasePredator (Abstract)
    │
    ├── HawkPredator      (Edge hunting)
    ├── FalconPredator    (Stoop diving)
    ├── EaglePredator     (Sustained pursuit)
    ├── OwlPredator       (Ambush)
    ├── SharkPredator     (Circling pursuit)
    ├── OrcaPredator      (Pack coordination)
    ├── BarracudaPredator (Burst ambush)
    └── SeaLionPredator   (Agile pursuit)
```

### BasePredator Class

#### Properties

```typescript
abstract class BasePredator {
  // Identity
  readonly id: number;
  abstract readonly type: PredatorType;
  abstract readonly color: string;
  abstract readonly panicRadius: number;
  
  // Physics
  position: Vector2;
  velocity: Vector2;
  protected maxSpeed: number = 18;
  protected maxForce: number = 0.8;
  
  // State machine
  state: PredatorBehaviorState;  // 'idle'|'scanning'|'stalking'|'hunting'|'attacking'|'diving'|'ambushing'|'recovering'
  protected stateTime: number = 0;
  protected huntDuration: number = 0;
  
  // Target tracking
  protected target: Vector2 | null = null;
  protected targetBirdId: number | null = null;
  
  // Energy system
  energy: number;
  protected cooldown: number = 0;
  protected recoveryTimer: number = 0;
  protected abstract readonly stats: IPredatorStats;
  
  // Statistics
  successfulHunts: number = 0;
  failedHunts: number = 0;
}
```

#### Energy Statistics Interface

```typescript
interface IPredatorStats {
  maxEnergy: number;           // Maximum energy (e.g., 80 for hawk)
  energyRegenRate: number;     // Energy per second while idle
  huntingDrain: number;        // Energy drain per second while hunting
  attackCost: number;          // One-time cost per attack
  exhaustionThreshold: number; // Must rest below this
  burstMultiplier: number;     // Speed boost during attack
  staminaRecoveryDelay: number; // Seconds before regen starts
}
```

### State Machine

```
            ┌─────────────────────────────────────────────────┐
            │                                                 │
            ▼                                                 │
        ┌───────┐    chance + energy    ┌──────────┐         │
        │ IDLE  │ ─────────────────────►│ SCANNING │         │
        └───────┘                       └────┬─────┘         │
            ▲                                │               │
            │                         found target           │
            │                                │               │
            │                                ▼               │
            │                         ┌──────────┐           │
            │                         │ STALKING │           │
            │                         └────┬─────┘           │
            │                              │                 │
            │                        close enough            │
            │                              │                 │
            │                              ▼               timeout
            │                         ┌─────────┐            │
            │      ◄──── timeout ────│ HUNTING │────────────┤
            │                         └────┬────┘            │
            │                              │                 │
            │                         very close             │
            │                              │                 │
            │                              ▼                 │
            │                        ┌───────────┐           │
            │                        │ ATTACKING │───────────┤
            │                        └─────┬─────┘           │
            │                              │                 │
            │                         success/fail           │
            │                              │                 │
            │                              ▼                 │
            │                        ┌────────────┐          │
            └────── energy ok ──────│ RECOVERING │◄─────────┘
                                    └────────────┘
                                      (low energy)
```

### Target Selection Algorithm

```typescript
protected findBestTarget(birds: Bird[], flockCenter: Vector2): ITargetScore | null {
  const scores: ITargetScore[] = [];
  
  for (const bird of birds) {
    const score = this.scorePrey(bird, birds, flockCenter);
    if (score.totalScore > 0) {
      scores.push(score);
    }
  }
  
  if (scores.length === 0) return null;
  
  // Sort by score descending
  scores.sort((a, b) => b.totalScore - a.totalScore);
  
  // Return one of top 3 (with randomness)
  const topCount = Math.min(3, scores.length);
  return scores[Math.floor(Math.random() * topCount)];
}

protected scorePrey(bird: Bird, allBirds: Bird[], flockCenter: Vector2): ITargetScore {
  // 1. Isolation score: How far from nearest neighbors
  let minNeighborDist = Infinity;
  let neighborCount = 0;
  for (const other of allBirds) {
    if (other.id === bird.id) continue;
    const dist = bird.position.dist(other.position);
    if (dist < 100) neighborCount++;
    minNeighborDist = Math.min(minNeighborDist, dist);
  }
  const isolationScore = Math.min(1, minNeighborDist / 80) * (1 - Math.min(1, neighborCount / 10));
  
  // 2. Edge score: Distance from flock center
  const distFromCenter = bird.position.dist(flockCenter);
  const edgeScore = Math.min(1, distFromCenter / 150);
  
  // 3. Velocity score: Moving away from flock
  const toCenter = flockCenter.clone().sub(bird.position).normalize();
  const birdDir = bird.velocity.clone().normalize();
  const velocityScore = Math.max(0, -toCenter.dot(birdDir));
  
  // 4. Panic score: Already panicked birds are easier
  const panicScore = bird.panicLevel * 0.5;
  
  // 5. Intercept score: Can we reach the bird?
  const distToBird = this.position.dist(bird.position);
  const interceptScore = Math.max(0, 1 - distToBird / 400);
  
  // Apply predator-specific weights
  const weights = this.getTargetWeights();
  const totalScore = 
    isolationScore * weights.isolation +
    edgeScore * weights.edge +
    velocityScore * weights.velocity +
    panicScore * weights.panic +
    interceptScore * weights.intercept;
  
  return { birdId: bird.id, position: bird.position, isolationScore, edgeScore, velocityScore, panicScore, interceptScore, totalScore };
}
```

### Predator Type Implementations

#### Hawk (Edge Hunter)

```typescript
class HawkPredator extends BasePredator {
  type: PredatorType = 'hawk';
  panicRadius = 120;
  
  stats = {
    maxEnergy: 80,
    energyRegenRate: 8,
    huntingDrain: 12,
    attackCost: 20,
    exhaustionThreshold: 15,
    burstMultiplier: 1.8,
    staminaRecoveryDelay: 2
  };
  
  // Special: Circles around flock, targets isolated birds
  // Has burst mode for short acceleration
  private circleAngle = 0;
  private isBursting = false;
  
  getTargetWeights() {
    return { isolation: 1.5, edge: 1.2, velocity: 0.8, panic: 0.3, intercept: 1.0 };
  }
}
```

#### Falcon (Stoop Diver)

```typescript
class FalconPredator extends BasePredator {
  type: PredatorType = 'falcon';
  panicRadius = 180;
  
  stats = {
    maxEnergy: 60,
    energyRegenRate: 6,
    huntingDrain: 8,
    attackCost: 25,
    exhaustionThreshold: 20,
    burstMultiplier: 3.5,  // Fastest dive!
    staminaRecoveryDelay: 3
  };
  
  // Special: Climbs to altitude, then dives
  private altitude = 0;  // 0-1, simulated height
  
  getEffectivePanicRadius(): number {
    // Panic radius reduced at altitude (birds don't see high falcon)
    return this.panicRadius * (1 - this.altitude * 0.7);
  }
}
```

#### Owl (Ambush Predator)

```typescript
class OwlPredator extends BasePredator {
  type: PredatorType = 'owl';
  panicRadius = 80;
  
  stats = {
    maxEnergy: 90,
    energyRegenRate: 10,
    huntingDrain: 15,
    attackCost: 15,
    exhaustionThreshold: 10,
    burstMultiplier: 2.0,
    staminaRecoveryDelay: 1
  };
  
  // Special: Waits motionless, then strikes
  private isStealthed = false;
  private stealthRadius = 40;  // Reduced detection when stealthed
  
  getEffectivePanicRadius(): number {
    return this.isStealthed ? this.stealthRadius : this.panicRadius;
  }
}
```

---

## Food System

### FoodSource Interface

```typescript
interface IFoodSource {
  id: number;
  position: IVector2;
  amount: number;            // Current food amount
  maxAmount: number;         // Maximum capacity
  radius: number;            // Attraction radius
  respawnTimer: number;      // Time until respawn
  consumed: boolean;         // Is depleted
  feeders: Set<number>;      // Bird IDs currently feeding
  consumptionRate: number;   // Rate based on feeder count
}
```

### FoodSourceManager

```typescript
class FoodSourceManager {
  private sources: Map<number, IFoodSource>;
  private width: number;
  private height: number;
  totalConsumed: number = 0;
  
  // Core operations
  initialize(config: IEnvironmentConfig): void;
  spawnFood(x: number, y: number, radius: number): number;
  update(deltaTime: number, config: IEnvironmentConfig): void;
  
  // Feeder management
  registerFeeder(birdId: number, foodId: number, maxFeeders: number): boolean;
  unregisterFeeder(birdId: number): void;
  getFeederCount(foodId: number): number;
  
  // Query methods
  getAttractionForce(position: Vector2, strength: number, radius: number, outForce: Vector2): boolean;
  getNearestAvailableFood(position: Vector2, radius: number, maxFeeders: number): IFoodSource | null;
  isSourceValid(foodId: number): boolean;
}
```

### Feeding State Machine

```
┌────────────────────────────────────────────────────────────────┐
│                       BIRD FEEDING STATES                      │
└────────────────────────────────────────────────────────────────┘

     ┌──────┐
     │ NONE │ ◄───────────────────────────────────────┐
     └──┬───┘                                          │
        │                                              │
        │ energy < 60% AND food in range              │
        ▼                                              │
  ┌─────────────┐                                      │
  │ APPROACHING │────► (food consumed) ────────────────┤
  └──────┬──────┘                                      │
         │                                             │
         │ distance < gatherRadius * 1.5              │
         ▼                                             │
   ┌───────────┐                                       │
   │ GATHERING │────► (food consumed) ─────────────────┤
   └─────┬─────┘                                       │
         │                                             │
         │ distance < 20 AND registered as feeder     │
         ▼                                             │
    ┌─────────┐                                        │
    │ FEEDING │────► (energy full OR duration met) ───┘
    └─────────┘
```

### Feeding State Implementation

```typescript
private updateFeedingState(bird: Bird, dt: number): void {
  switch (bird.feedingState) {
    case 'none': {
      // Check if should start approaching food
      const energyUrgency = 1 - bird.energy;
      if (energyUrgency > 0.4) {
        const nearestFood = this.foodManager.getNearestAvailableFood(
          bird.position,
          this.envConfig.foodAttractionRadius,
          this.envConfig.maxFeedersPerFood
        );
        if (nearestFood) {
          bird.startApproachingFood(nearestFood.id);
        }
      }
      break;
    }
    
    case 'approaching': {
      if (!this.foodManager.isSourceValid(bird.targetFoodId)) {
        this.exitFeedingState(bird);
        break;
      }
      
      const source = this.foodManager.getSourceById(bird.targetFoodId);
      const dist = bird.position.dist(source.position);
      
      if (dist < this.envConfig.gatherRadius * 1.5) {
        bird.startGathering();
      }
      if (bird.energy > 0.9) {
        this.exitFeedingState(bird);
      }
      break;
    }
    
    case 'gathering': {
      const source = this.foodManager.getSourceById(bird.targetFoodId);
      const dist = bird.position.dist(source.position);
      
      if (dist < 20) {
        if (this.foodManager.registerFeeder(bird.id, bird.targetFoodId, maxFeeders)) {
          bird.startFeeding();
        }
      }
      if (dist > gatherRadius * 2) {
        bird.startApproachingFood(bird.targetFoodId);
      }
      break;
    }
    
    case 'feeding': {
      bird.feedingTimer += dt;
      bird.restoreEnergy(this.config.foodEnergyRestore * dt);
      
      const minDurationMet = bird.feedingTimer >= feedingDuration;
      const energySatisfied = bird.energy > 0.8;
      
      if (bird.energy >= 1.0 || (minDurationMet && energySatisfied)) {
        this.exitFeedingState(bird);
      }
      break;
    }
  }
}
```

### Feeding Forces

```typescript
// Approaching: Direct movement toward food
calculateApproachingForce(bird, foodPosition, maxSpeed, maxForce, outForce): void {
  const dx = foodPosition.x - bird.position.x;
  const dy = foodPosition.y - bird.position.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  
  // Desired velocity toward food
  outForce.x = (dx / dist) * maxSpeed;
  outForce.y = (dy / dist) * maxSpeed;
  
  // Arrival behavior - slow down as we approach
  if (dist < 50) {
    outForce.mult(dist / 50);
  }
  
  outForce.sub(bird.velocity);
  outForce.limit(maxForce);
}

// Gathering: Orbit around food
calculateGatheringForce(bird, foodPosition, gatherRadius, behaviorType, maxSpeed, maxForce, outForce): void {
  const dx = foodPosition.x - bird.position.x;
  const dy = foodPosition.y - bird.position.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  
  // Tangent for circular motion
  const tangentX = -dy / dist;
  const tangentY = dx / dist;
  
  // Radial force to maintain orbit distance
  const distanceError = dist - gatherRadius;
  
  outForce.x = (dx / dist) * distanceError * 0.5 + tangentX * maxSpeed * 0.5;
  outForce.y = (dy / dist) * distanceError * 0.5 + tangentY * maxSpeed * 0.5;
  
  outForce.sub(bird.velocity);
  outForce.limit(maxForce);
}

// Feeding: Stay at food (strong damping)
calculateFeedingForce(bird, foodPosition, maxSpeed, maxForce, outForce): void {
  const dist = bird.position.dist(foodPosition);
  
  if (dist < 5) {
    // Stop movement
    outForce.x = -bird.velocity.x * 0.3;
    outForce.y = -bird.velocity.y * 0.3;
  } else {
    // Slow approach
    outForce.x = (foodPosition.x - bird.position.x) * 0.1;
    outForce.y = (foodPosition.y - bird.position.y) * 0.1;
    outForce.limit(maxForce * 0.5);
  }
}
```

---

## Mating System

### Mating States

```typescript
type MatingState = 
  | 'none'        // Not seeking
  | 'seeking'     // Looking for mate
  | 'approaching' // Moving toward target
  | 'courting'    // Close, pre-mating display
  | 'mating'      // Paired and stationary
  | 'fighting'    // Male competition
  | 'cooldown';   // Post-mating recovery
```

### Mating Configuration

```typescript
interface IEnvironmentConfig {
  matingEnabled: boolean;
  mateSearchRadius: number;        // 80 - Detection range
  mateAttractionStrength: number;  // 0.8 - Force multiplier
  courtingDistance: number;        // 30 - Start courting
  matingDistance: number;          // 15 - Lock into mating
  matingDuration: number;          // 3.0s - Pair duration
  matingCooldown: number;          // 8.0s - Recovery time
  fightRadius: number;             // 50 - Male competition range
  fightDuration: number;           // 1.5s - Contest length
  fightStrength: number;           // 1.2 - Repulsion force
  panicSuppressesMating: boolean;  // true - High panic disables
  energyThresholdForMating: number;// 0.4 - Min energy
  femaleSelectivity: number;       // 0.3 - Rejection rate
}
```

### Mating State Machine

```
┌───────────────────────────────────────────────────────────────────┐
│                       MATING STATE MACHINE                        │
└───────────────────────────────────────────────────────────────────┘

                          random 2% chance
      ┌──────┐               per frame               ┌─────────┐
      │ NONE │ ─────────────────────────────────────►│ SEEKING │
      └──────┘                                       └────┬────┘
          ▲                                               │
          │                                   found opposite gender
          │                                               │
          │                                               ▼
          │                                       ┌────────────┐
          │                            rival ────►│ APPROACHING │
          │                            detected   └──────┬─────┘
          │                                 │            │
          │                                 │      close enough
          │                                 │            │
          │                                 ▼            ▼
          │                           ┌──────────┐ ┌──────────┐
          │                           │ FIGHTING │ │ COURTING │
          │                           └────┬─────┘ └────┬─────┘
          │                                │            │
          │                         winner │    very close
          │                                │            │
          │                                └──────┬─────┘
          │                                       │
          │                                       ▼
          │                                 ┌──────────┐
          │                                 │  MATING  │
          │                                 └────┬─────┘
          │                                      │
          │                              duration complete
          │                                      │
          │        cooldown complete             ▼
          │◄──────────────────────────── ┌──────────┐
                                         │ COOLDOWN │
                                         └──────────┘
```

### Mating Behavior Implementation

```typescript
private updateMatingBehavior(bird: Bird, neighbors: Bird[], dt: number): void {
  // Skip if high panic
  if (this.envConfig.panicSuppressesMating && bird.panicLevel > 0.5) {
    bird.clearMatingState();
    return;
  }
  
  // Skip if low energy
  if (this.config.energyEnabled && 
      bird.energy < this.envConfig.energyThresholdForMating &&
      bird.matingState === 'none') {
    return;
  }
  
  switch (bird.matingState) {
    case 'none':
      this.tryStartSeeking(bird);
      break;
    case 'seeking':
      this.seekMate(bird, neighbors);
      break;
    case 'approaching':
      this.approachMate(bird, neighbors, dt);
      break;
    case 'courting':
      this.courtMate(bird, neighbors, dt);
      break;
    case 'mating':
      this.maintainMating(bird, dt);
      break;
    case 'fighting':
      this.resolveFight(bird, neighbors, dt);
      break;
    case 'cooldown':
      if (bird.matingCooldown <= 0) {
        bird.matingState = 'none';
      }
      break;
  }
}
```

### Mate Selection

```typescript
private seekMate(bird: Bird, neighbors: Bird[]): void {
  let bestCandidate: Bird | null = null;
  let bestDistSq = this.envConfig.mateSearchRadius ** 2;
  
  for (const other of neighbors) {
    if (other.id === bird.id) continue;
    if (other.gender === bird.gender) continue;           // Opposite gender only
    if (other.speciesId !== bird.speciesId) continue;     // Same species
    if (other.matingState !== 'none' && other.matingState !== 'seeking') continue;
    if (other.matingCooldown > 0) continue;
    
    const distSq = bird.position.distSq(other.position);
    if (distSq < bestDistSq) {
      // Female selectivity check
      if (bird.gender === 'male' && other.gender === 'female') {
        if (Math.random() < this.envConfig.femaleSelectivity) continue;
      }
      bestDistSq = distSq;
      bestCandidate = other;
    }
  }
  
  if (bestCandidate) {
    bird.startApproachingMate(bestCandidate.id);
  }
}
```

### Male Competition (Fighting)

```typescript
private resolveFight(bird: Bird, neighbors: Bird[], dt: number): void {
  bird.matingTimer += dt;
  
  const target = this.birds.find(b => b.id === bird.targetMateId);
  if (!target) {
    bird.endMatingBehavior(this.envConfig.matingCooldown * 0.5);
    return;
  }
  
  // Find rivals
  const rivals: Bird[] = [];
  for (const n of neighbors) {
    if (n.id !== bird.id && n.gender === 'male' && n.targetMateId === target.id) {
      const distSq = bird.position.distSq(n.position);
      if (distSq < this.envConfig.fightRadius ** 2) {
        rivals.push(n);
      }
    }
  }
  
  // Apply repulsion from rivals
  for (const rival of rivals) {
    this.calculateFightRepulsionForce(bird, rival, tempFightForce);
    bird.applyForce(tempFightForce);
  }
  
  // Drain energy during fighting
  if (this.config.energyEnabled) {
    bird.energy = Math.max(0, bird.energy - 0.05 * dt);
  }
  
  // Resolve after duration
  if (bird.matingTimer >= this.envConfig.fightDuration) {
    const myScore = bird.aggressionLevel + bird.energy + Math.random() * 0.3;
    let isWinner = true;
    
    for (const rival of rivals) {
      const rivalScore = rival.aggressionLevel + rival.energy + Math.random() * 0.3;
      if (rivalScore > myScore) {
        isWinner = false;
        break;
      }
    }
    
    if (isWinner) {
      bird.startApproachingMate(bird.targetMateId);
    } else {
      bird.endMatingBehavior(this.envConfig.matingCooldown * 0.5);
    }
  }
}
```

---

## Energy System

### Mechanics

```typescript
// In Bird.update()
if (energyEnabled && this.energy > 0) {
  // Higher speed = more energy consumption
  const speedFactor = 1 + (this.speed / config.maxSpeed) * 0.5;
  this.energy -= energyDecayRate * deltaTime * speedFactor;
  if (this.energy < 0) this.energy = 0;
}

// Energy affects max speed
let effectiveMaxSpeed = config.maxSpeed;
if (energyEnabled) {
  const energyMultiplier = minEnergySpeed + (1 - minEnergySpeed) * this.energy;
  effectiveMaxSpeed *= energyMultiplier;
  // At energy=0: speed = maxSpeed * 0.3
  // At energy=1: speed = maxSpeed * 1.0
}
```

### Energy Restoration

```typescript
// During feeding state
if (bird.feedingState === 'feeding') {
  const energyRestore = config.foodEnergyRestore * dt;
  bird.restoreEnergy(energyRestore);  // Adds energy, capped at 1.0
}
```

### Energy Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `energyEnabled` | false | Toggle energy system |
| `energyDecayRate` | 0.02 | Energy drain per second |
| `minEnergySpeed` | 0.3 | Speed at zero energy (30%) |
| `foodEnergyRestore` | 0.3 | Energy restored per second while feeding |
| `energyThresholdForMating` | 0.4 | Min energy to seek mate |
