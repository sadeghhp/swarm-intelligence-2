import { Vector2 } from '../utils/Vector2';
import type { IFoodSource } from '../types';
import type { BirdArrays } from '../simulation/Bird';

/**
 * Manages food sources and bird feeding behavior.
 */
export class FoodSourceManager {
  private foodSources: Map<number, IFoodSource> = new Map();
  private nextId: number = 0;

  // Configuration
  private worldWidth: number;
  private worldHeight: number;
  private respawnTime: number;
  private maxFeeders: number;
  private gatherRadius: number;
  private feedingDuration: number;
  private attractionRadius: number;
  private foodEnergyRestore: number;

  constructor(
    worldWidth: number,
    worldHeight: number,
    config: {
      respawnTime: number;
      maxFeeders: number;
      gatherRadius: number;
      feedingDuration: number;
      attractionRadius: number;
      foodEnergyRestore: number;
    }
  ) {
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
    this.respawnTime = config.respawnTime;
    this.maxFeeders = config.maxFeeders;
    this.gatherRadius = config.gatherRadius;
    this.feedingDuration = config.feedingDuration;
    this.attractionRadius = config.attractionRadius;
    this.foodEnergyRestore = config.foodEnergyRestore;
  }

  /**
   * Spawn food sources at random positions.
   */
  spawnFood(count: number, radius: number = 80): void {
    const margin = 150;

    for (let i = 0; i < count; i++) {
      const x = margin + Math.random() * (this.worldWidth - margin * 2);
      const y = margin + Math.random() * (this.worldHeight - margin * 2);

      this.addFoodSource(x, y, radius);
    }
  }

  /**
   * Add a food source at position.
   */
  addFoodSource(x: number, y: number, radius: number = 80, amount: number = 100): number {
    const id = this.nextId++;

    const foodSource: IFoodSource = {
      id,
      position: new Vector2(x, y) as any,
      amount,
      maxAmount: amount,
      radius,
      respawnTimer: 0,
      consumed: false,
      feeders: new Set(),
      consumptionRate: 0.5
    };

    this.foodSources.set(id, foodSource);
    return id;
  }

  /**
   * Remove a food source.
   */
  removeFoodSource(id: number): void {
    this.foodSources.delete(id);
  }

  /**
   * Update food sources and bird feeding behavior.
   */
  update(dt: number, birdArrays: BirdArrays): void {
    const count = birdArrays.count;

    // Update each food source
    for (const food of this.foodSources.values()) {
      // Handle respawning
      if (food.consumed) {
        food.respawnTimer += dt;
        if (food.respawnTimer >= this.respawnTime) {
          food.consumed = false;
          food.amount = food.maxAmount;
          food.respawnTimer = 0;
          food.feeders.clear();
        }
        continue;
      }

      // Clear invalid feeders
      food.feeders.forEach(birdId => {
        if (birdId >= count) {
          food.feeders.delete(birdId);
        }
      });

      // Process feeding birds
      for (const birdId of food.feeders) {
        const feedingState = birdArrays.feedingState[birdId];

        if (feedingState === 3) {
          // Feeding - consume food and restore energy
          const consumed = Math.min(food.consumptionRate * dt, food.amount);
          food.amount -= consumed;
          birdArrays.energy[birdId] = Math.min(1, birdArrays.energy[birdId] + this.foodEnergyRestore * dt);
          birdArrays.feedingTimer[birdId] += dt;

          // Done feeding
          if (birdArrays.feedingTimer[birdId] > this.feedingDuration) {
            birdArrays.feedingState[birdId] = 0; // none
            birdArrays.targetFoodId[birdId] = -1;
            food.feeders.delete(birdId);
          }
        }
      }

      // Check if depleted
      if (food.amount <= 0) {
        food.consumed = true;
        food.feeders.clear();

        // Reset all birds targeting this food
        for (let i = 0; i < count; i++) {
          if (birdArrays.targetFoodId[i] === food.id) {
            birdArrays.feedingState[i] = 0;
            birdArrays.targetFoodId[i] = -1;
          }
        }
      }
    }

    // Update bird feeding states
    for (let i = 0; i < count; i++) {
      this.updateBirdFeeding(i, birdArrays);
    }
  }

  /**
   * Update single bird's feeding behavior.
   */
  private updateBirdFeeding(birdIndex: number, birdArrays: BirdArrays): void {
    const state = birdArrays.feedingState[birdIndex];
    const targetId = birdArrays.targetFoodId[birdIndex];
    const bx = birdArrays.positionX[birdIndex];
    const by = birdArrays.positionY[birdIndex];

    // Not interested in food if panicked
    if (birdArrays.panicLevel[birdIndex] > 0.3) {
      if (state !== 0) {
        this.exitFeeding(birdIndex, birdArrays);
      }
      return;
    }

    // State machine
    switch (state) {
      case 0: // none
        // Look for food if energy is low
        if (birdArrays.energy[birdIndex] < 0.6) {
          const nearestFood = this.findNearestAvailableFood(bx, by);
          if (nearestFood) {
            birdArrays.feedingState[birdIndex] = 1; // approaching
            birdArrays.targetFoodId[birdIndex] = nearestFood.id;
          }
        }
        break;

      case 1: // approaching
        {
          const food = this.foodSources.get(targetId);
          if (!food || food.consumed) {
            this.exitFeeding(birdIndex, birdArrays);
            break;
          }

          const dist = Math.sqrt(
            (bx - (food.position as any).x) ** 2 +
            (by - (food.position as any).y) ** 2
          );

          // Within gather radius
          if (dist < this.gatherRadius) {
            birdArrays.feedingState[birdIndex] = 2; // gathering
          }

          // Too far - give up
          if (dist > this.attractionRadius * 2) {
            this.exitFeeding(birdIndex, birdArrays);
          }
        }
        break;

      case 2: // gathering
        {
          const food = this.foodSources.get(targetId);
          if (!food || food.consumed) {
            this.exitFeeding(birdIndex, birdArrays);
            break;
          }

          // Check if can start feeding
          if (food.feeders.size < this.maxFeeders) {
            const dist = Math.sqrt(
              (bx - (food.position as any).x) ** 2 +
              (by - (food.position as any).y) ** 2
            );

            if (dist < food.radius * 0.5) {
              birdArrays.feedingState[birdIndex] = 3; // feeding
              birdArrays.feedingTimer[birdIndex] = 0;
              food.feeders.add(birdIndex);
            }
          }
        }
        break;

      case 3: // feeding
        // Handled in food source update
        break;
    }
  }

  /**
   * Exit feeding state for a bird.
   */
  private exitFeeding(birdIndex: number, birdArrays: BirdArrays): void {
    const targetId = birdArrays.targetFoodId[birdIndex];

    if (targetId >= 0) {
      const food = this.foodSources.get(targetId);
      food?.feeders.delete(birdIndex);
    }

    birdArrays.feedingState[birdIndex] = 0;
    birdArrays.targetFoodId[birdIndex] = -1;
    birdArrays.feedingTimer[birdIndex] = 0;
  }

  /**
   * Find nearest available food source.
   */
  private findNearestAvailableFood(x: number, y: number): IFoodSource | null {
    let nearest: IFoodSource | null = null;
    let minDist = Infinity;

    for (const food of this.foodSources.values()) {
      if (food.consumed) continue;
      if (food.feeders.size >= this.maxFeeders) continue;

      const dist = Math.sqrt(
        (x - (food.position as any).x) ** 2 +
        (y - (food.position as any).y) ** 2
      );

      if (dist < this.attractionRadius && dist < minDist) {
        minDist = dist;
        nearest = food;
      }
    }

    return nearest;
  }

  /**
   * Calculate attraction force toward food for a bird.
   */
  getAttractionForce(
    birdIndex: number,
    birdArrays: BirdArrays,
    strength: number
  ): { x: number; y: number } | null {
    const targetId = birdArrays.targetFoodId[birdIndex];
    const state = birdArrays.feedingState[birdIndex];

    if (state === 0 || targetId < 0) return null;

    const food = this.foodSources.get(targetId);
    if (!food || food.consumed) return null;

    const bx = birdArrays.positionX[birdIndex];
    const by = birdArrays.positionY[birdIndex];
    const fx = (food.position as any).x;
    const fy = (food.position as any).y;

    const dx = fx - bx;
    const dy = fy - by;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 1) return null;

    // Stronger attraction when closer to feeding
    const mult = state === 2 ? 1.5 : 1.0;

    return {
      x: (dx / dist) * strength * mult,
      y: (dy / dist) * strength * mult
    };
  }

  /**
   * Get all food sources.
   */
  getFoodSources(): IFoodSource[] {
    return Array.from(this.foodSources.values());
  }

  /**
   * Get active (not consumed) food count.
   */
  getActiveFoodCount(): number {
    let count = 0;
    for (const food of this.foodSources.values()) {
      if (!food.consumed) count++;
    }
    return count;
  }

  /**
   * Get total number of feeding birds.
   */
  getFeedingBirdCount(): number {
    let count = 0;
    for (const food of this.foodSources.values()) {
      count += food.feeders.size;
    }
    return count;
  }

  /**
   * Resize world bounds.
   */
  resize(width: number, height: number): void {
    this.worldWidth = width;
    this.worldHeight = height;
  }

  /**
   * Clear all food sources.
   */
  clear(): void {
    this.foodSources.clear();
  }

  /**
   * Update configuration.
   */
  updateConfig(config: {
    respawnTime?: number;
    maxFeeders?: number;
    gatherRadius?: number;
    feedingDuration?: number;
    attractionRadius?: number;
    foodEnergyRestore?: number;
  }): void {
    if (config.respawnTime !== undefined) this.respawnTime = config.respawnTime;
    if (config.maxFeeders !== undefined) this.maxFeeders = config.maxFeeders;
    if (config.gatherRadius !== undefined) this.gatherRadius = config.gatherRadius;
    if (config.feedingDuration !== undefined) this.feedingDuration = config.feedingDuration;
    if (config.attractionRadius !== undefined) this.attractionRadius = config.attractionRadius;
    if (config.foodEnergyRestore !== undefined) this.foodEnergyRestore = config.foodEnergyRestore;
  }
}

