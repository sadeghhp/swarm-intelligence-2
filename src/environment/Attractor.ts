import type { IAttractor } from '../types';

let nextAttractorId = 0;

/**
 * Create an attractor point.
 */
export function createAttractor(
  x: number,
  y: number,
  strength: number = 1.0,
  radius: number = 200,
  lifetime: number = 3.0,
  isRepulsor: boolean = false
): IAttractor {
  return {
    id: nextAttractorId++,
    x,
    y,
    strength,
    radius,
    lifetime,
    isRepulsor
  };
}

/**
 * Manager for multiple attractors.
 */
export class AttractorManager {
  private attractors: Map<number, IAttractor> = new Map();

  /**
   * Add an attractor.
   */
  add(attractor: IAttractor): void {
    this.attractors.set(attractor.id, attractor);
  }

  /**
   * Create and add an attractor at position.
   */
  addAt(
    x: number,
    y: number,
    strength: number = 1.0,
    radius: number = 200,
    lifetime: number = 3.0,
    isRepulsor: boolean = false
  ): IAttractor {
    const attractor = createAttractor(x, y, strength, radius, lifetime, isRepulsor);
    this.add(attractor);
    return attractor;
  }

  /**
   * Remove an attractor by ID.
   */
  remove(id: number): void {
    this.attractors.delete(id);
  }

  /**
   * Update all attractors (decay lifetime).
   */
  update(dt: number): void {
    for (const [id, attractor] of this.attractors) {
      attractor.lifetime -= dt;
      if (attractor.lifetime <= 0) {
        this.attractors.delete(id);
      }
    }
  }

  /**
   * Get all attractors.
   */
  getAll(): IAttractor[] {
    return Array.from(this.attractors.values());
  }

  /**
   * Get attractor count.
   */
  get count(): number {
    return this.attractors.size;
  }

  /**
   * Clear all attractors.
   */
  clear(): void {
    this.attractors.clear();
  }

  /**
   * Calculate combined force from all attractors at a position.
   */
  getForceAt(x: number, y: number, maxForce: number = 1.0): { x: number; y: number } {
    let forceX = 0;
    let forceY = 0;

    for (const attractor of this.attractors.values()) {
      const dx = attractor.x - x;
      const dy = attractor.y - y;
      const distSq = dx * dx + dy * dy;
      const dist = Math.sqrt(distSq);

      if (dist > attractor.radius || dist < 1) continue;

      // Strength falls off with distance
      const strength = attractor.strength * (1 - dist / attractor.radius);
      const force = strength / dist;

      if (attractor.isRepulsor) {
        forceX -= dx * force;
        forceY -= dy * force;
      } else {
        forceX += dx * force;
        forceY += dy * force;
      }
    }

    // Limit total force
    const mag = Math.sqrt(forceX * forceX + forceY * forceY);
    if (mag > maxForce) {
      forceX = (forceX / mag) * maxForce;
      forceY = (forceY / mag) * maxForce;
    }

    return { x: forceX, y: forceY };
  }
}

