import { Vector2, tempVec1 } from '../utils/Vector2';
import type { ISimulationConfig, IVector2, IAttractor } from '../types';
import type { Bird } from './Bird';

// Version: 1.1.0 - Enhanced steering behaviors per documentation

// Temporary vectors for calculations
const steerVec = new Vector2();

/**
 * Implements Reynolds' Boids flocking algorithm with additional behaviors.
 * Version: 1.1.0 - Enhanced with distance-weighted alignment, density-adaptive
 * cohesion, and inverse-square separation.
 */
export class SwarmRules {
  /**
   * Calculate all flocking forces for a bird.
   */
  static calculateForces(
    bird: Bird,
    neighbors: Bird[],
    config: ISimulationConfig
  ): Vector2 {
    const force = new Vector2();

    // Calculate alignment, cohesion, separation
    const alignment = this.alignment(bird, neighbors, config);
    const cohesion = this.cohesion(bird, neighbors, config);
    const separation = this.separation(bird, neighbors, config);

    // Apply weights
    force.add(alignment.mult(config.alignmentWeight));
    force.add(cohesion.mult(config.cohesionWeight));
    force.add(separation.mult(config.separationWeight));

    return force;
  }

  /**
   * Alignment: Steer towards average heading of neighbors.
   * Uses distance-weighted influence (closer neighbors have stronger influence).
   */
  static alignment(
    bird: Bird,
    neighbors: Bird[],
    config: ISimulationConfig
  ): Vector2 {
    const avgVelocity = new Vector2();
    let totalWeight = 0;

    for (const other of neighbors) {
      if (other.id === bird.id) continue;

      const d = bird.position.dist(other.position);
      if (d > 0 && d < config.perceptionRadius) {
        // Check field of view
        if (bird.isInFieldOfView(other.position, config.fieldOfView)) {
          // Distance-weighted influence: closer = stronger
          const weight = 1 - (d / config.perceptionRadius);
          avgVelocity.x += other.velocity.x * weight;
          avgVelocity.y += other.velocity.y * weight;
          totalWeight += weight;
        }
      }
    }

    if (totalWeight > 0) {
      avgVelocity.div(totalWeight);
      avgVelocity.setMag(config.maxSpeed);
      avgVelocity.sub(bird.velocity);
      avgVelocity.limit(config.maxForce);
    }

    return avgVelocity;
  }

  /**
   * Cohesion: Steer towards center of mass of neighbors.
   * Uses distance-weighted positions and density adaptation (reduces cohesion when crowded).
   */
  static cohesion(
    bird: Bird,
    neighbors: Bird[],
    config: ISimulationConfig
  ): Vector2 {
    const centerOfMass = new Vector2();
    let totalWeight = 0;
    let count = 0;

    for (const other of neighbors) {
      if (other.id === bird.id) continue;

      const d = bird.position.dist(other.position);
      if (d > 0 && d < config.perceptionRadius) {
        if (bird.isInFieldOfView(other.position, config.fieldOfView)) {
          // Distance-weighted position
          const weight = 1 - (d / config.perceptionRadius);
          centerOfMass.x += other.position.x * weight;
          centerOfMass.y += other.position.y * weight;
          totalWeight += weight;
          count++;
        }
      }
    }

    if (totalWeight > 0) {
      // Calculate weighted center of mass
      centerOfMass.div(totalWeight);
      
      // Vector from bird to center
      centerOfMass.sub(bird.position);
      
      // Density adaptation: reduce cohesion when crowded
      // At 20+ neighbors, cohesion drops to 30%
      const densityFactor = Math.max(0.3, 1 - count / 20);
      centerOfMass.mult(densityFactor);
      
      // Convert to steering force
      centerOfMass.setMag(config.maxSpeed);
      centerOfMass.sub(bird.velocity);
      centerOfMass.limit(config.maxForce);
      
      return centerOfMass;
    }

    return new Vector2();
  }

  /**
   * Separation: Steer away from nearby neighbors.
   * Uses inverse-square weighting: closer neighbors create MUCH stronger repulsion.
   */
  static separation(
    bird: Bird,
    neighbors: Bird[],
    config: ISimulationConfig
  ): Vector2 {
    const steer = new Vector2();
    let count = 0;

    const sepRadiusSq = config.separationRadius * config.separationRadius;

    for (const other of neighbors) {
      if (other.id === bird.id) continue;

      const dx = bird.position.x - other.position.x;
      const dy = bird.position.y - other.position.y;
      const distSq = dx * dx + dy * dy;

      if (distSq > 0 && distSq < sepRadiusSq) {
        if (bird.isInFieldOfView(other.position, config.fieldOfView)) {
          const d = Math.sqrt(distSq);
          
          // Inverse-square weighting: closer = MUCH stronger
          // This creates a strong repulsion field at close range
          const invDistSq = 1 / distSq;
          steer.x += (dx / d) * invDistSq;
          steer.y += (dy / d) * invDistSq;
          count++;
        }
      }
    }

    if (count > 0) {
      steer.div(count);
      
      if (!steer.isZero()) {
        steer.setMag(config.maxSpeed);
        steer.sub(bird.velocity);
        steer.limit(config.maxForce);
      }
    }

    return steer;
  }

  /**
   * Seek: Steer towards a target position.
   */
  static seek(
    bird: Bird,
    target: IVector2,
    maxSpeed: number,
    maxForce: number
  ): Vector2 {
    steerVec.copy(target).sub(bird.position);
    const d = steerVec.mag();
    
    if (d > 0) {
      steerVec.setMag(maxSpeed);
      steerVec.sub(bird.velocity);
      steerVec.limit(maxForce);
    }

    return steerVec.clone();
  }

  /**
   * Flee: Steer away from a target position.
   */
  static flee(
    bird: Bird,
    target: IVector2,
    maxSpeed: number,
    maxForce: number
  ): Vector2 {
    steerVec.copy(bird.position).sub(target);
    const d = steerVec.mag();
    
    if (d > 0) {
      steerVec.setMag(maxSpeed);
      steerVec.sub(bird.velocity);
      steerVec.limit(maxForce);
    }

    return steerVec.clone();
  }

  /**
   * Arrive: Seek with slowing near target.
   */
  static arrive(
    bird: Bird,
    target: IVector2,
    maxSpeed: number,
    maxForce: number,
    slowRadius: number
  ): Vector2 {
    steerVec.copy(target).sub(bird.position);
    const d = steerVec.mag();
    
    if (d > 0) {
      // Ramp down speed within slow radius
      let desiredSpeed = maxSpeed;
      if (d < slowRadius) {
        desiredSpeed = maxSpeed * (d / slowRadius);
      }
      
      steerVec.setMag(desiredSpeed);
      steerVec.sub(bird.velocity);
      steerVec.limit(maxForce);
    }

    return steerVec.clone();
  }

  /**
   * Wander: Semi-random movement for natural behavior.
   */
  static wander(
    bird: Bird,
    wanderStrength: number,
    noiseStrength: number,
    time: number
  ): Vector2 {
    // Use heading + noise to create smooth wandering
    const heading = bird.heading;
    const noise = Math.sin(time + bird.id * 0.1) * noiseStrength;
    const wanderAngle = heading + (Math.random() - 0.5) * wanderStrength + noise;

    return Vector2.fromAngle(wanderAngle).mult(wanderStrength);
  }

  /**
   * Calculate local density around a bird.
   */
  static calculateLocalDensity(
    bird: Bird,
    neighbors: Bird[],
    config: ISimulationConfig
  ): number {
    let count = 0;

    for (const other of neighbors) {
      if (other.id === bird.id) continue;

      const d = bird.position.dist(other.position);
      if (d > 0 && d < config.perceptionRadius) {
        count++;
      }
    }

    // Normalize by expected density
    const expectedPerArea = Math.PI * config.perceptionRadius * config.perceptionRadius / 1000;
    return Math.min(count / Math.max(expectedPerArea, 1), 1);
  }

  /**
   * Propagate panic from a panicked bird to neighbors.
   */
  static propagatePanic(
    bird: Bird,
    neighbors: Bird[],
    panicSpread: number,
    perceptionRadius: number
  ): void {
    if (bird.panicLevel < 0.1) return;

    for (const other of neighbors) {
      if (other.id === bird.id) continue;

      const d = bird.position.dist(other.position);
      if (d > 0 && d < perceptionRadius) {
        // Panic spreads with distance decay
        const spreadStrength = bird.panicLevel * panicSpread * (1 - d / perceptionRadius);
        other.applyPanic(other.panicLevel + spreadStrength);
      }
    }
  }

  /**
   * Apply attractor/repulsor force.
   */
  static attractorForce(
    bird: Bird,
    attractor: IAttractor,
    maxForce: number,
    maxSpeed: number
  ): Vector2 {
    tempVec1.set(attractor.x, attractor.y);
    const d = bird.position.dist(tempVec1);

    if (d > attractor.radius) {
      return new Vector2();
    }

    // Strength falls off with distance
    const strength = attractor.strength * (1 - d / attractor.radius);

    if (attractor.isRepulsor) {
      return this.flee(bird, tempVec1, maxSpeed * strength, maxForce * strength);
    } else {
      return this.seek(bird, tempVec1, maxSpeed * strength, maxForce * strength);
    }
  }

  /**
   * High-performance flocking using spatial grid (SoA version).
   * Operates directly on BirdArrays for GPU-style parallelism.
   * Enhanced with distance-weighted alignment, density-adaptive cohesion,
   * and inverse-square separation per documentation.
   */
  static calculateForcesOptimized(
    birdIndex: number,
    posX: Float32Array,
    posY: Float32Array,
    velX: Float32Array,
    velY: Float32Array,
    _heading: Float32Array,
    neighborIds: number[],
    config: ISimulationConfig,
    outForceX: Float32Array,
    outForceY: Float32Array
  ): number {
    const px = posX[birdIndex];
    const py = posY[birdIndex];
    const vx = velX[birdIndex];
    const vy = velY[birdIndex];

    // Accumulators with weights
    let alignX = 0, alignY = 0, alignWeight = 0;
    let cohX = 0, cohY = 0, cohWeight = 0;
    let sepX = 0, sepY = 0, sepCount = 0;
    let neighborCount = 0;

    const percRad = config.perceptionRadius;
    const percRadSq = percRad * percRad;
    const sepRadSq = config.separationRadius * config.separationRadius;
    const fovCos = Math.cos(config.fieldOfView * Math.PI / 360);

    // Check neighbors
    for (const otherId of neighborIds) {
      if (otherId === birdIndex) continue;

      const dx = posX[otherId] - px;
      const dy = posY[otherId] - py;
      const distSq = dx * dx + dy * dy;

      if (distSq < percRadSq && distSq > 0.0001) {
        // FOV check
        const velMag = Math.sqrt(vx * vx + vy * vy);
        if (velMag > 0.01) {
          const toMag = Math.sqrt(distSq);
          const dot = (vx * dx + vy * dy) / (velMag * toMag);
          if (dot < fovCos) continue;
        }

        const dist = Math.sqrt(distSq);
        neighborCount++;

        // Distance weight: closer = stronger influence (1 at center, 0 at edge)
        const weight = 1 - (dist / percRad);

        // Alignment: distance-weighted velocity averaging
        alignX += velX[otherId] * weight;
        alignY += velY[otherId] * weight;
        alignWeight += weight;

        // Cohesion: distance-weighted position averaging
        cohX += posX[otherId] * weight;
        cohY += posY[otherId] * weight;
        cohWeight += weight;

        // Separation: inverse-square weighting for strong close-range repulsion
        if (distSq < sepRadSq) {
          const invDistSq = 1 / distSq;
          sepX -= (dx / dist) * invDistSq;
          sepY -= (dy / dist) * invDistSq;
          sepCount++;
        }
      }
    }

    let forceX = 0, forceY = 0;

    // Process alignment (distance-weighted)
    if (alignWeight > 0) {
      alignX /= alignWeight;
      alignY /= alignWeight;
      const mag = Math.sqrt(alignX * alignX + alignY * alignY);
      if (mag > 0) {
        alignX = alignX / mag * config.maxSpeed - vx;
        alignY = alignY / mag * config.maxSpeed - vy;
        const steerMag = Math.sqrt(alignX * alignX + alignY * alignY);
        if (steerMag > config.maxForce) {
          alignX = alignX / steerMag * config.maxForce;
          alignY = alignY / steerMag * config.maxForce;
        }
        forceX += alignX * config.alignmentWeight;
        forceY += alignY * config.alignmentWeight;
      }
    }

    // Process cohesion (distance-weighted with density adaptation)
    if (cohWeight > 0) {
      // Calculate weighted center of mass
      cohX = cohX / cohWeight - px;
      cohY = cohY / cohWeight - py;
      
      // Density adaptation: reduce cohesion when crowded
      // At 20+ neighbors, cohesion drops to 30%
      const densityFactor = Math.max(0.3, 1 - neighborCount / 20);
      cohX *= densityFactor;
      cohY *= densityFactor;
      
      const mag = Math.sqrt(cohX * cohX + cohY * cohY);
      if (mag > 0) {
        const desiredX = cohX / mag * config.maxSpeed;
        const desiredY = cohY / mag * config.maxSpeed;
        cohX = desiredX - vx;
        cohY = desiredY - vy;
        const steerMag = Math.sqrt(cohX * cohX + cohY * cohY);
        if (steerMag > config.maxForce) {
          cohX = cohX / steerMag * config.maxForce;
          cohY = cohY / steerMag * config.maxForce;
        }
        forceX += cohX * config.cohesionWeight;
        forceY += cohY * config.cohesionWeight;
      }
    }

    // Process separation (inverse-square weighted)
    if (sepCount > 0) {
      sepX /= sepCount;
      sepY /= sepCount;
      const mag = Math.sqrt(sepX * sepX + sepY * sepY);
      if (mag > 0) {
        sepX = sepX / mag * config.maxSpeed - vx;
        sepY = sepY / mag * config.maxSpeed - vy;
        const steerMag = Math.sqrt(sepX * sepX + sepY * sepY);
        if (steerMag > config.maxForce) {
          sepX = sepX / steerMag * config.maxForce;
          sepY = sepY / steerMag * config.maxForce;
        }
        forceX += sepX * config.separationWeight;
        forceY += sepY * config.separationWeight;
      }
    }

    outForceX[birdIndex] = forceX;
    outForceY[birdIndex] = forceY;

    return neighborCount;
  }
}


