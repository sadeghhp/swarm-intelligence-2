import type { Flux } from '@flux-gpu/core';
import { Bird, BirdArrays } from './Bird';
import { SpatialGrid } from './SpatialGrid';
import { SwarmRules } from './SwarmRules';
import { GPUSimulationRunner } from './gpu/GPUSimulationRunner';
import { degToRad, fbm } from '../utils/MathUtils';
import type { ISimulationConfig, IEnvironmentConfig, IAttractor } from '../types';

// Fixed timestep for physics
const FIXED_TIMESTEP = 1 / 60;
const MAX_SUBSTEPS = 5;

/**
 * Manages the flock simulation, handling both CPU and GPU compute paths.
 */
export class Flock {
  // Entity storage
  private birds: Bird[] = [];
  private birdArrays: BirdArrays;
  
  // Spatial optimization
  private spatialGrid: SpatialGrid;
  
  // GPU compute
  private gpuRunner: GPUSimulationRunner | null = null;
  private useGPU: boolean = false;
  private gpuReady: boolean = false;
  
  // Configuration
  private simConfig: ISimulationConfig;
  private envConfig: IEnvironmentConfig;
  
  // World bounds
  private width: number;
  private height: number;
  
  // Simulation state
  private time: number = 0;
  private accumulator: number = 0;
  
  // External forces
  private attractors: IAttractor[] = [];
  
  // Temp arrays for optimized calculations
  private forceX: Float32Array;
  private forceY: Float32Array;

  constructor(
    width: number,
    height: number,
    maxBirds: number,
    simConfig: ISimulationConfig,
    envConfig: IEnvironmentConfig
  ) {
    this.width = width;
    this.height = height;
    this.simConfig = simConfig;
    this.envConfig = envConfig;
    
    // Initialize bird arrays (SoA for GPU)
    this.birdArrays = new BirdArrays(maxBirds);
    
    // Initialize spatial grid
    this.spatialGrid = new SpatialGrid(width, height, simConfig.perceptionRadius);
    
    // Temp force arrays
    this.forceX = new Float32Array(maxBirds);
    this.forceY = new Float32Array(maxBirds);
  }

  /**
   * Initialize GPU compute.
   */
  async initGPU(): Promise<boolean> {
    const capabilities = await GPUSimulationRunner.checkCapabilities();
    
    if (!capabilities.available) {
      console.warn('GPU not available:', capabilities.reason);
      return false;
    }
    
    console.log('GPU available:', capabilities.adapter);
    
    this.gpuRunner = new GPUSimulationRunner();
    const success = await this.gpuRunner.initialize(
      this.birdArrays.maxCount,
      this.width,
      this.height
    );
    
    if (success) {
      this.gpuReady = true;
      this.useGPU = true;
      console.log('GPU compute enabled');
    }
    
    return success;
  }

  /**
   * Initialize GPU compute with shared Flux context.
   * This enables sharing the GPU device between compute and rendering.
   */
  async initGPUWithFlux(flux: Flux): Promise<boolean> {
    console.log('Initializing GPU with shared Flux context');
    
    this.gpuRunner = new GPUSimulationRunner();
    const success = await this.gpuRunner.initializeWithFlux(
      flux,
      this.birdArrays.maxCount,
      this.width,
      this.height
    );
    
    if (success) {
      this.gpuReady = true;
      this.useGPU = true;
      console.log('GPU compute enabled (Flux shared context)');
    }
    
    return success;
  }

  /**
   * Toggle GPU/CPU compute.
   */
  setUseGPU(use: boolean): void {
    if (use && !this.gpuReady) {
      console.warn('GPU not ready, staying on CPU');
      return;
    }
    this.useGPU = use;
  }

  /**
   * Spawn birds randomly in the world.
   */
  spawnBirds(count: number): void {
    const margin = this.simConfig.boundaryMargin;
    
    // Clear existing birds
    this.birds = [];
    
    for (let i = 0; i < count; i++) {
      const x = margin + Math.random() * (this.width - margin * 2);
      const y = margin + Math.random() * (this.height - margin * 2);
      const bird = new Bird(i, x, y);
      this.birds.push(bird);
    }
    
    // Sync to SoA
    this.birdArrays.fromBirds(this.birds);
    
    // Upload to GPU if available
    if (this.gpuReady && this.gpuRunner) {
      this.gpuRunner.uploadData(this.birdArrays);
    }
    
    // Rebuild spatial grid
    this.spatialGrid.rebuildFromArrays(
      this.birdArrays.positionX,
      this.birdArrays.positionY,
      this.birdArrays.count
    );
  }

  /**
   * Update bird count (respawns if different).
   */
  setBirdCount(count: number): void {
    if (count !== this.birds.length) {
      this.spawnBirds(count);
    }
  }

  /**
   * Update simulation by deltaTime.
   */
  update(deltaTime: number): void {
    this.time += deltaTime;
    
    // Fixed timestep accumulation
    this.accumulator += deltaTime;
    let steps = 0;
    
    while (this.accumulator >= FIXED_TIMESTEP && steps < MAX_SUBSTEPS) {
      this.step(FIXED_TIMESTEP);
      this.accumulator -= FIXED_TIMESTEP;
      steps++;
    }
    
    // Clamp accumulator to prevent spiral of death
    if (this.accumulator > FIXED_TIMESTEP * MAX_SUBSTEPS) {
      this.accumulator = 0;
    }
  }

  /**
   * Single simulation step.
   */
  private step(dt: number): void {
    if (this.useGPU && this.gpuReady && this.gpuRunner) {
      this.stepGPU(dt);
    } else {
      this.stepCPU(dt);
    }
  }

  /**
   * CPU simulation step.
   * Version: 2.0.0 - Enhanced with smooth steering-based boundary avoidance,
   * position-based wind turbulence, and smooth wander.
   */
  private stepCPU(dt: number): void {
    const count = this.birdArrays.count;
    
    // Rebuild spatial grid
    this.spatialGrid.rebuildFromArrays(
      this.birdArrays.positionX,
      this.birdArrays.positionY,
      count
    );
    
    // Base wind direction and speed
    const windAngle = degToRad(this.envConfig.windDirection);
    const baseWindX = this.envConfig.windEnabled ? Math.cos(windAngle) * this.envConfig.windSpeed : 0;
    const baseWindY = this.envConfig.windEnabled ? Math.sin(windAngle) * this.envConfig.windSpeed : 0;
    const windTurbulence = this.envConfig.windTurbulence || 0;
    
    // Noise parameters
    const noiseScale = 0.003;
    const timeScale = 0.5;
    
    // Calculate forces for all birds
    for (let i = 0; i < count; i++) {
      const px = this.birdArrays.positionX[i];
      const py = this.birdArrays.positionY[i];
      
      // Get neighbor candidates from spatial grid
      const neighborIds = this.spatialGrid.getNeighborIds(
        px,
        py,
        this.simConfig.perceptionRadius,
        i
      );
      
      // Calculate flocking forces
      const neighborCount = SwarmRules.calculateForcesOptimized(
        i,
        this.birdArrays.positionX,
        this.birdArrays.positionY,
        this.birdArrays.velocityX,
        this.birdArrays.velocityY,
        this.birdArrays.heading,
        neighborIds,
        this.simConfig,
        this.forceX,
        this.forceY
      );
      
      // Normalized density for visualization
      this.birdArrays.localDensity[i] = Math.min(1, neighborCount / 20);
      
      // Wall proximity damping: reduce flocking forces when near walls
      // This prevents neighbors from pulling birds into walls
      const margin = this.simConfig.boundaryMargin;
      const wallDampingFactor = this.simConfig.wallDampingFactor ?? 0.8;
      const distToLeft = px;
      const distToRight = this.width - px;
      const distToTop = py;
      const distToBottom = this.height - py;
      const minDistToWall = Math.min(distToLeft, distToRight, distToTop, distToBottom);
      
      if (minDistToWall < margin) {
        // Calculate proximity factor: 0 at wall, 1 at margin edge
        const wallProximity = Math.max(0, minDistToWall / margin);
        // Apply damping: closer to wall = weaker flocking forces
        const dampedProximity = wallProximity * wallDampingFactor + (1 - wallDampingFactor);
        this.forceX[i] *= dampedProximity;
        this.forceY[i] *= dampedProximity;
        
        // Anti-cluster jitter: add random perturbation when very close to wall
        // This breaks up clusters that form at boundaries
        if (minDistToWall < margin * 0.3) {
          const jitterStrength = (1 - minDistToWall / (margin * 0.3)) * 0.5;
          this.forceX[i] += (Math.random() - 0.5) * jitterStrength;
          this.forceY[i] += (Math.random() - 0.5) * jitterStrength;
        }
      }
      
      // Add boundary avoidance
      this.applyBoundaryForce(i);
      
      // Add wind with position-based turbulence
      if (this.envConfig.windEnabled) {
        let windX = baseWindX;
        let windY = baseWindY;
        
        if (windTurbulence > 0) {
          // Turbulent angle variation using FBM noise
          const angleNoise = fbm(
            px * noiseScale + this.time * timeScale,
            py * noiseScale,
            3
          ) * Math.PI * windTurbulence;
          
          // Turbulent speed variation
          const speedNoise = fbm(
            px * noiseScale + 1000,
            py * noiseScale + this.time * timeScale,
            3
          ) * windTurbulence;
          
          const turbAngle = windAngle + angleNoise;
          const turbSpeed = this.envConfig.windSpeed * (1 + speedNoise);
          
          windX = Math.cos(turbAngle) * turbSpeed;
          windY = Math.sin(turbAngle) * turbSpeed;
        }
        
        this.forceX[i] += windX;
        this.forceY[i] += windY;
      }
      
      // Add smooth wander using Perlin noise
      const wanderNoiseX = px * 0.01 + this.time * 0.5;
      const wanderNoiseY = py * 0.01 + i * 0.1;
      const wanderNoise = fbm(wanderNoiseX, wanderNoiseY, 2);
      const heading = this.birdArrays.heading[i];
      const wanderAngle = heading + wanderNoise * this.simConfig.noiseStrength * Math.PI;
      this.forceX[i] += Math.cos(wanderAngle) * this.simConfig.wanderStrength;
      this.forceY[i] += Math.sin(wanderAngle) * this.simConfig.wanderStrength;
      
      // Add attractor forces
      for (const attractor of this.attractors) {
        this.applyAttractorForce(i, attractor);
      }
    }
    
    // Integrate physics
    const energyEnabled = this.simConfig.energyEnabled;
    const energyDecayRate = this.simConfig.energyDecayRate;
    const minEnergySpeed = this.simConfig.minEnergySpeed;
    
    for (let i = 0; i < count; i++) {
      // Apply acceleration
      this.birdArrays.velocityX[i] += this.forceX[i] * dt * 60;
      this.birdArrays.velocityY[i] += this.forceY[i] * dt * 60;
      
      // Calculate speed
      const speed = Math.sqrt(
        this.birdArrays.velocityX[i] ** 2 +
        this.birdArrays.velocityY[i] ** 2
      );
      
      // Energy affects max speed: low energy = slower movement
      let energyMultiplier = 1.0;
      if (energyEnabled) {
        const energy = this.birdArrays.energy[i];
        energyMultiplier = minEnergySpeed + (1 - minEnergySpeed) * energy;
      }
      
      // Panic boost
      const panicBoost = 1 + this.birdArrays.panicLevel[i] * 0.5;
      const effectiveMaxSpeed = this.simConfig.maxSpeed * panicBoost * energyMultiplier;
      
      // Limit velocity
      if (speed > effectiveMaxSpeed) {
        this.birdArrays.velocityX[i] = (this.birdArrays.velocityX[i] / speed) * effectiveMaxSpeed;
        this.birdArrays.velocityY[i] = (this.birdArrays.velocityY[i] / speed) * effectiveMaxSpeed;
      }
      
      // Update position
      this.birdArrays.positionX[i] += this.birdArrays.velocityX[i] * dt * this.simConfig.simulationSpeed;
      this.birdArrays.positionY[i] += this.birdArrays.velocityY[i] * dt * this.simConfig.simulationSpeed;
      
      // Boundary handling:
      // - Keep agents inside bounds
      // - Reflect velocity when hitting walls (prevents "sticking" to borders)
      const pad = 10;
      const minX = pad;
      const maxX = this.width - pad;
      const minY = pad;
      const maxY = this.height - pad;
      const restitution = 0.8;     // bounce energy retained
      const wallFriction = 0.98;   // damp tangential velocity on collision

      let x = this.birdArrays.positionX[i];
      let y = this.birdArrays.positionY[i];

      // Left/right walls
      if (x <= minX) {
        x = minX;
        this.birdArrays.velocityX[i] = Math.abs(this.birdArrays.velocityX[i]) * restitution;
        this.birdArrays.velocityY[i] *= wallFriction;
      } else if (x >= maxX) {
        x = maxX;
        this.birdArrays.velocityX[i] = -Math.abs(this.birdArrays.velocityX[i]) * restitution;
        this.birdArrays.velocityY[i] *= wallFriction;
      }

      // Top/bottom walls
      if (y <= minY) {
        y = minY;
        this.birdArrays.velocityY[i] = Math.abs(this.birdArrays.velocityY[i]) * restitution;
        this.birdArrays.velocityX[i] *= wallFriction;
      } else if (y >= maxY) {
        y = maxY;
        this.birdArrays.velocityY[i] = -Math.abs(this.birdArrays.velocityY[i]) * restitution;
        this.birdArrays.velocityX[i] *= wallFriction;
      }

      this.birdArrays.positionX[i] = x;
      this.birdArrays.positionY[i] = y;
      
      // Minimum escape velocity: ensure birds have enough speed to escape walls
      const minEscapeSpeed = (this.simConfig.minEscapeSpeed ?? 0.3) * this.simConfig.maxSpeed;
      const currentSpeed = Math.sqrt(
        this.birdArrays.velocityX[i] ** 2 + this.birdArrays.velocityY[i] ** 2
      );
      if (currentSpeed > 0.01 && currentSpeed < minEscapeSpeed) {
        const speedUp = minEscapeSpeed / currentSpeed;
        this.birdArrays.velocityX[i] *= speedUp;
        this.birdArrays.velocityY[i] *= speedUp;
      }
      
      // Update heading
      const newSpeed = Math.sqrt(
        this.birdArrays.velocityX[i] ** 2 + this.birdArrays.velocityY[i] ** 2
      );
      if (newSpeed > 0.1) {
        this.birdArrays.heading[i] = Math.atan2(this.birdArrays.velocityY[i], this.birdArrays.velocityX[i]);
      }
      
      // Decay panic
      this.birdArrays.panicLevel[i] *= 0.98;
      if (this.birdArrays.panicLevel[i] < 0.01) {
        this.birdArrays.panicLevel[i] = 0;
      }
      
      // Energy decay based on speed (faster movement = more energy drain)
      if (energyEnabled && this.birdArrays.energy[i] > 0) {
        const speedFactor = 1 + (speed / this.simConfig.maxSpeed) * 0.5;
        this.birdArrays.energy[i] -= energyDecayRate * dt * speedFactor;
        if (this.birdArrays.energy[i] < 0) {
          this.birdArrays.energy[i] = 0;
        }
      }
    }
    
    // Clear force accumulators
    this.forceX.fill(0);
    this.forceY.fill(0);
    
    // Update firefly glow synchronization if enabled
    if (this.envConfig.fireflyEnabled) {
      this.updateFireflySynchronization(dt);
    }
  }

  /**
   * Update firefly glow synchronization using biological Firefly Algorithm.
   * Version: 2.0.0 - Pulse-coupled oscillators with Phase Response Curve (PRC).
   * 
   * Biological firefly synchronization:
   * 1. Each firefly has an internal oscillator (phase 0 to 1)
   * 2. When phase reaches 1, the firefly flashes and resets to 0
   * 3. When a firefly SEES a neighbor's flash, it advances its own phase
   * 4. This "phase advance on flash" leads to emergent synchronization
   * 
   * The Phase Response Curve (PRC) determines how much phase advances:
   * - Early in cycle: small advance (not ready to flash)
   * - Late in cycle: large advance (almost ready, gets pushed over)
   */
  private updateFireflySynchronization(dt: number): void {
    const count = this.birdArrays.count;
    const syncRadius = this.envConfig.fireflySyncRadius ?? this.simConfig.perceptionRadius;
    const couplingStrength = this.envConfig.fireflyCouplingStrength ?? 0.5;
    const baseFrequency = this.envConfig.fireflyBaseFrequency ?? 1.0;
    const flashDuration = this.envConfig.fireflyFlashDuration ?? 0.2;
    
    const syncRadiusSq = syncRadius * syncRadius;
    
    // Flash threshold - when phase crosses this, firefly flashes
    const FLASH_THRESHOLD = 1.0;
    
    // Temporary array for phase advances (reuse forceX)
    const phaseAdvance = this.forceX;
    
    // Step 1: Detect which fireflies are currently flashing
    // A firefly is "flashing" if its glow intensity is above threshold
    const isFlashing = this.forceY; // Reuse forceY as boolean array (0 or 1)
    for (let i = 0; i < count; i++) {
      isFlashing[i] = this.birdArrays.glowIntensity[i] > 0.8 ? 1 : 0;
    }
    
    // Step 2: Calculate phase advance for each firefly based on seeing flashes
    for (let i = 0; i < count; i++) {
      const px = this.birdArrays.positionX[i];
      const py = this.birdArrays.positionY[i];
      const myPhase = this.birdArrays.glowPhase[i];
      
      // Get neighbors from spatial grid
      const neighborIds = this.spatialGrid.getNeighborIds(px, py, syncRadius, i);
      
      let totalAdvance = 0;
      
      // Check each neighbor for flashes
      for (const neighborId of neighborIds) {
        // Only respond to flashing neighbors
        if (isFlashing[neighborId] < 0.5) continue;
        
        const nx = this.birdArrays.positionX[neighborId];
        const ny = this.birdArrays.positionY[neighborId];
        
        // Distance check
        const dx = nx - px;
        const dy = ny - py;
        const distSq = dx * dx + dy * dy;
        
        if (distSq < syncRadiusSq && distSq > 0.01) {
          // Distance-based light intensity (inverse square law)
          const dist = Math.sqrt(distSq);
          const lightIntensity = 1.0 / (1.0 + dist * dist * 0.001);
          
          // Phase Response Curve (PRC):
          // - If I'm early in my cycle (phase < 0.3), small advance
          // - If I'm late in my cycle (phase > 0.7), large advance
          // - This creates the "almost ready to flash" synchronization
          const prc = myPhase * myPhase; // Quadratic PRC - more advance when closer to flashing
          
          // Accumulate phase advance from this flash
          totalAdvance += lightIntensity * prc * couplingStrength * 0.1;
        }
      }
      
      phaseAdvance[i] = totalAdvance;
    }
    
    // Step 3: Update phases and calculate glow intensity
    for (let i = 0; i < count; i++) {
      const naturalFreq = this.birdArrays.naturalFrequency[i] * baseFrequency;
      
      // Phase advance: natural progression + response to neighbor flashes
      let newPhase = this.birdArrays.glowPhase[i] + naturalFreq * dt + phaseAdvance[i];
      
      // Check for flash (phase crosses threshold)
      let justFlashed = false;
      if (newPhase >= FLASH_THRESHOLD) {
        justFlashed = true;
        newPhase = newPhase - FLASH_THRESHOLD; // Reset with overflow
      }
      
      // Clamp phase to [0, 1)
      while (newPhase >= 1.0) newPhase -= 1.0;
      while (newPhase < 0) newPhase += 1.0;
      
      this.birdArrays.glowPhase[i] = newPhase;
      
      // Calculate glow intensity from phase
      // Sharp flash when phase is near 0 (just after reset)
      if (newPhase < flashDuration || justFlashed) {
        // Flash phase: bright pulse
        const t = newPhase / flashDuration;
        // Sharp rise, gradual fall for realistic flash
        if (t < 0.3) {
          // Quick rise
          this.birdArrays.glowIntensity[i] = t / 0.3;
        } else {
          // Gradual fall
          this.birdArrays.glowIntensity[i] = 1.0 - ((t - 0.3) / 0.7) * 0.8;
        }
      } else {
        // Dim phase: very low ambient glow
        // Slight increase as approaching next flash
        const dimProgress = (newPhase - flashDuration) / (1.0 - flashDuration);
        this.birdArrays.glowIntensity[i] = 0.02 + dimProgress * 0.08;
      }
    }
    
    // Clear the temporary arrays
    phaseAdvance.fill(0);
    isFlashing.fill(0);
  }

  /**
   * Apply smooth boundary avoidance force to bird at index.
   * Version: 2.0.0 - Steering-based with look-ahead anticipation and smooth curves.
   * 
   * Features:
   * - Look-ahead anticipation based on current velocity
   * - Smooth non-linear force curve (quadratic with smoothstep)
   * - Steering-based force for natural curved trajectories
   */
  private applyBoundaryForce(i: number): void {
    const x = this.birdArrays.positionX[i];
    const y = this.birdArrays.positionY[i];
    const vx = this.birdArrays.velocityX[i];
    const vy = this.birdArrays.velocityY[i];
    const margin = this.simConfig.boundaryMargin;
    const force = this.simConfig.boundaryForce;
    const maxSpeed = this.simConfig.maxSpeed;
    const maxForce = this.simConfig.maxForce;
    
    // Calculate current speed for look-ahead
    const speed = Math.sqrt(vx * vx + vy * vy);
    
    // Look-ahead time scales with speed (faster = look further ahead)
    // Uses configurable lookAhead multiplier (default 0.5)
    const lookAheadMultiplier = this.simConfig.boundaryLookAhead ?? 0.5;
    const lookAheadTime = speed > 0.1 ? lookAheadMultiplier * (speed / maxSpeed) : 0;
    
    // Calculate future position based on current velocity
    const futureX = x + vx * lookAheadTime;
    const futureY = y + vy * lookAheadTime;
    
    // Calculate distances to boundaries (use both current and future positions)
    const distLeft = Math.min(x, futureX);
    const distRight = Math.min(this.width - x, this.width - futureX);
    const distTop = Math.min(y, futureY);
    const distBottom = Math.min(this.height - y, this.height - futureY);
    
    // Force curve power (configurable, default 2.0 for quadratic smooth acceleration)
    const power = this.simConfig.boundaryCurvePower ?? 2.0;
    
    // Accumulate boundary force
    let boundaryX = 0;
    let boundaryY = 0;
    
    // Left edge - smooth force curve
    if (distLeft < margin && distLeft > 0) {
      const t = 1 - distLeft / margin;
      const smoothT = t * t * (3 - 2 * t); // smoothstep
      boundaryX += force * Math.pow(smoothT, power);
    } else if (distLeft <= 0) {
      boundaryX += force;
    }
    
    // Right edge
    if (distRight < margin && distRight > 0) {
      const t = 1 - distRight / margin;
      const smoothT = t * t * (3 - 2 * t);
      boundaryX -= force * Math.pow(smoothT, power);
    } else if (distRight <= 0) {
      boundaryX -= force;
    }
    
    // Top edge
    if (distTop < margin && distTop > 0) {
      const t = 1 - distTop / margin;
      const smoothT = t * t * (3 - 2 * t);
      boundaryY += force * Math.pow(smoothT, power);
    } else if (distTop <= 0) {
      boundaryY += force;
    }
    
    // Bottom edge
    if (distBottom < margin && distBottom > 0) {
      const t = 1 - distBottom / margin;
      const smoothT = t * t * (3 - 2 * t);
      boundaryY -= force * Math.pow(smoothT, power);
    } else if (distBottom <= 0) {
      boundaryY -= force;
    }
    
    // Apply as steering force for smooth direction change
    const boundaryMag = Math.sqrt(boundaryX * boundaryX + boundaryY * boundaryY);
    
    if (boundaryMag > 0.001) {
      // Calculate desired velocity direction (away from boundary)
      let desiredX = boundaryX / boundaryMag * maxSpeed;
      let desiredY = boundaryY / boundaryMag * maxSpeed;
      
      // Scale by force ratio for gradual turn
      const forceRatio = Math.min(1, boundaryMag / force);
      desiredX *= forceRatio;
      desiredY *= forceRatio;
      
      // Steering = desired - current (Reynolds steering formula)
      let steerX = desiredX - vx * forceRatio;
      let steerY = desiredY - vy * forceRatio;
      
      // Limit steering force
      const steerMag = Math.sqrt(steerX * steerX + steerY * steerY);
      if (steerMag > maxForce) {
        steerX = steerX / steerMag * maxForce;
        steerY = steerY / steerMag * maxForce;
      }
      
      // Apply steering force
      this.forceX[i] += steerX;
      this.forceY[i] += steerY;
    }
  }

  /**
   * Apply attractor force to bird at index.
   */
  private applyAttractorForce(i: number, attractor: IAttractor): void {
    const dx = attractor.x - this.birdArrays.positionX[i];
    const dy = attractor.y - this.birdArrays.positionY[i];
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist > attractor.radius || dist < 0.1) return;
    
    const strength = attractor.strength * (1 - dist / attractor.radius);
    const force = strength / dist;
    
    if (attractor.isRepulsor) {
      this.forceX[i] -= dx * force;
      this.forceY[i] -= dy * force;
    } else {
      this.forceX[i] += dx * force;
      this.forceY[i] += dy * force;
    }
  }

  /**
   * GPU simulation step.
   */
  private stepGPU(dt: number): void {
    if (!this.gpuRunner) return;
    
    // Update config
    this.gpuRunner.updateConfig(this.simConfig, this.envConfig, dt);
    
    // Run compute shaders
    this.gpuRunner.compute();
    
    // Firefly synchronization runs on CPU even in GPU mode
    // (it's lightweight and doesn't need GPU acceleration)
    if (this.envConfig.fireflyEnabled) {
      this.updateFireflySynchronizationGPUMode(dt);
    }
  }
  
  /**
   * Update firefly glow synchronization for GPU mode.
   * Version: 2.0.0 - Pulse-coupled oscillators with global flash detection.
   * 
   * Uses global flash counting since we can't do spatial queries efficiently
   * with GPU-computed positions. Creates emergent synchronization through
   * collective response to flash events.
   */
  private updateFireflySynchronizationGPUMode(dt: number): void {
    const count = this.birdArrays.count;
    const couplingStrength = this.envConfig.fireflyCouplingStrength ?? 0.5;
    const baseFrequency = this.envConfig.fireflyBaseFrequency ?? 1.0;
    const flashDuration = this.envConfig.fireflyFlashDuration ?? 0.2;
    
    // Flash threshold
    const FLASH_THRESHOLD = 1.0;
    
    // Step 1: Count how many fireflies are currently flashing
    let flashingCount = 0;
    for (let i = 0; i < count; i++) {
      if (this.birdArrays.glowIntensity[i] > 0.8) {
        flashingCount++;
      }
    }
    
    // Normalized flash signal (0 to 1)
    const flashSignal = flashingCount / count;
    
    // Step 2: Update each firefly's phase
    for (let i = 0; i < count; i++) {
      const naturalFreq = this.birdArrays.naturalFrequency[i] * baseFrequency;
      let phase = this.birdArrays.glowPhase[i];
      
      // Phase Response Curve: respond more strongly when closer to flashing
      const prc = phase * phase; // Quadratic - more response late in cycle
      
      // Phase advance from seeing flashes (global coupling)
      const flashResponse = flashSignal * prc * couplingStrength * 0.15;
      
      // Natural phase progression + flash response
      let newPhase = phase + naturalFreq * dt + flashResponse;
      
      // Check for flash (phase crosses threshold)
      let justFlashed = false;
      if (newPhase >= FLASH_THRESHOLD) {
        justFlashed = true;
        newPhase = newPhase - FLASH_THRESHOLD;
      }
      
      // Clamp phase to [0, 1)
      while (newPhase >= 1.0) newPhase -= 1.0;
      while (newPhase < 0) newPhase += 1.0;
      
      this.birdArrays.glowPhase[i] = newPhase;
      
      // Calculate glow intensity
      if (newPhase < flashDuration || justFlashed) {
        // Flash phase: sharp pulse
        const t = newPhase / flashDuration;
        if (t < 0.3) {
          this.birdArrays.glowIntensity[i] = t / 0.3;
        } else {
          this.birdArrays.glowIntensity[i] = 1.0 - ((t - 0.3) / 0.7) * 0.8;
        }
      } else {
        // Dim phase: very low glow, slight increase approaching flash
        const dimProgress = (newPhase - flashDuration) / (1.0 - flashDuration);
        this.birdArrays.glowIntensity[i] = 0.02 + dimProgress * 0.08;
      }
    }
  }

  /**
   * Sync data from GPU back to CPU (for rendering).
   */
  async syncFromGPU(): Promise<void> {
    if (this.gpuRunner && this.gpuReady) {
      await this.gpuRunner.downloadData(this.birdArrays);
    }
  }

  /**
   * Apply panic at a position (e.g., from predator).
   */
  applyPanicAtPosition(x: number, y: number, radius: number, strength: number): void {
    const radiusSq = radius * radius;
    const count = this.birdArrays.count;
    
    for (let i = 0; i < count; i++) {
      const dx = this.birdArrays.positionX[i] - x;
      const dy = this.birdArrays.positionY[i] - y;
      const distSq = dx * dx + dy * dy;
      
      if (distSq < radiusSq) {
        const dist = Math.sqrt(distSq);
        const panicAmount = strength * (1 - dist / radius);
        this.birdArrays.panicLevel[i] = Math.max(
          this.birdArrays.panicLevel[i],
          Math.min(1, panicAmount)
        );
      }
    }
  }

  /**
   * Add an attractor/repulsor.
   */
  addAttractor(attractor: IAttractor): void {
    this.attractors.push(attractor);
  }

  /**
   * Remove an attractor by ID.
   */
  removeAttractor(id: number): void {
    this.attractors = this.attractors.filter(a => a.id !== id);
  }

  /**
   * Update attractors (decay lifetime).
   */
  updateAttractors(dt: number): void {
    for (let i = this.attractors.length - 1; i >= 0; i--) {
      this.attractors[i].lifetime -= dt;
      if (this.attractors[i].lifetime <= 0) {
        this.attractors.splice(i, 1);
      }
    }
  }

  /**
   * Resize world bounds.
   */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.spatialGrid.resize(width, height);
    if (this.gpuRunner) {
      this.gpuRunner.resize(width, height);
    }
  }

  /**
   * Update configuration.
   */
  updateConfig(simConfig: ISimulationConfig, envConfig: IEnvironmentConfig): void {
    this.simConfig = simConfig;
    this.envConfig = envConfig;
  }

  /**
   * Get bird arrays for rendering.
   */
  getBirdArrays(): BirdArrays {
    return this.birdArrays;
  }

  /**
   * Get bird count.
   */
  get birdCount(): number {
    return this.birdArrays.count;
  }

  /**
   * Get attractors.
   */
  getAttractors(): IAttractor[] {
    return this.attractors;
  }

  /**
   * Get statistics.
   */
  getStats(): {
    avgDensity: number;
    avgSpeed: number;
    avgEnergy: number;
    avgPanic: number;
  } {
    let totalDensity = 0;
    let totalSpeed = 0;
    let totalEnergy = 0;
    let totalPanic = 0;
    const count = this.birdArrays.count;
    
    for (let i = 0; i < count; i++) {
      totalDensity += this.birdArrays.localDensity[i];
      totalSpeed += Math.sqrt(
        this.birdArrays.velocityX[i] ** 2 +
        this.birdArrays.velocityY[i] ** 2
      );
      totalEnergy += this.birdArrays.energy[i];
      totalPanic += this.birdArrays.panicLevel[i];
    }
    
    return {
      avgDensity: count > 0 ? totalDensity / count : 0,
      avgSpeed: count > 0 ? totalSpeed / count : 0,
      avgEnergy: count > 0 ? totalEnergy / count : 0,
      avgPanic: count > 0 ? totalPanic / count : 0
    };
  }

  /**
   * Check if using GPU compute.
   */
  get isUsingGPU(): boolean {
    return this.useGPU && this.gpuReady;
  }

  /**
   * Set perception radius dynamically.
   */
  setPerceptionRadius(radius: number): void {
    this.simConfig.perceptionRadius = radius;
    // Rebuild spatial grid with new cell size
    this.spatialGrid = new SpatialGrid(this.width, this.height, radius);
    console.log('Perception radius updated:', radius);
  }

  /**
   * Get extended statistics including gender counts and social behavior.
   */
  getExtendedStats(): {
    avgDensity: number;
    avgSpeed: number;
    avgEnergy: number;
    avgPanic: number;
    maleCount: number;
    femaleCount: number;
    matingPairs: number;
    fightingPairs: number;
    feedingBirds: number;
  } {
    let totalDensity = 0;
    let totalSpeed = 0;
    let totalEnergy = 0;
    let totalPanic = 0;
    let maleCount = 0;
    let femaleCount = 0;
    let matingCount = 0;
    let fightingCount = 0;
    let feedingCount = 0;
    const count = this.birdArrays.count;
    
    for (let i = 0; i < count; i++) {
      totalDensity += this.birdArrays.localDensity[i];
      totalSpeed += Math.sqrt(
        this.birdArrays.velocityX[i] ** 2 +
        this.birdArrays.velocityY[i] ** 2
      );
      totalEnergy += this.birdArrays.energy[i];
      totalPanic += this.birdArrays.panicLevel[i];
      
      // Gender count
      if (this.birdArrays.gender[i] === 1) {
        maleCount++;
      } else {
        femaleCount++;
      }
      
      // Mating state (mating = 4, fighting = 5)
      const matingState = this.birdArrays.matingState[i];
      if (matingState === 4) {
        matingCount++;
      } else if (matingState === 5) {
        fightingCount++;
      }
      
      // Feeding state (feeding = 3)
      if (this.birdArrays.feedingState[i] === 3) {
        feedingCount++;
      }
    }
    
    return {
      avgDensity: count > 0 ? totalDensity / count : 0,
      avgSpeed: count > 0 ? totalSpeed / count : 0,
      avgEnergy: count > 0 ? totalEnergy / count : 0,
      avgPanic: count > 0 ? totalPanic / count : 0,
      maleCount,
      femaleCount,
      matingPairs: Math.floor(matingCount / 2), // Each pair has 2 birds
      fightingPairs: Math.floor(fightingCount / 2),
      feedingBirds: feedingCount
    };
  }

  /**
   * Reset simulation to initial state.
   */
  reset(): void {
    // Clear all birds
    this.birdArrays.count = 0;
    this.birds = [];
    
    // Reset time
    this.time = 0;
    this.accumulator = 0;
    
    // Clear attractors
    this.attractors = [];
    
    // Clear force arrays
    this.forceX.fill(0);
    this.forceY.fill(0);
    
    // Reset spatial grid
    this.spatialGrid = new SpatialGrid(this.width, this.height, this.simConfig.perceptionRadius);
    
    console.log('Flock reset');
  }

  /**
   * Set predator position for panic response.
   * @param position Predator position or null if no predator
   * @param panicRadius Optional panic radius override
   */
  setPredatorPosition(position: { x: number; y: number } | null, panicRadius?: number): void {
    if (!position) {
      // Clear predator influence - decay panic for all birds
      const count = this.birdArrays.count;
      const decayRate = this.envConfig.panicDecay;
      for (let i = 0; i < count; i++) {
        this.birdArrays.panicLevel[i] *= (1 - decayRate * 0.5);
        if (this.birdArrays.panicLevel[i] < 0.01) {
          this.birdArrays.panicLevel[i] = 0;
        }
      }
      return;
    }

    const radius = panicRadius ?? this.envConfig.panicRadius;
    const radiusSq = radius * radius;
    const count = this.birdArrays.count;

    // Apply panic to birds within radius
    for (let i = 0; i < count; i++) {
      const dx = this.birdArrays.positionX[i] - position.x;
      const dy = this.birdArrays.positionY[i] - position.y;
      const distSq = dx * dx + dy * dy;

      if (distSq < radiusSq) {
        const dist = Math.sqrt(distSq);
        const panicIntensity = 1 - dist / radius;
        this.birdArrays.panicLevel[i] = Math.max(
          this.birdArrays.panicLevel[i],
          panicIntensity
        );
      }
    }
  }

  /**
   * Set food manager reference for feeding behavior.
   * @param manager FoodSourceManager instance or null
   */
  setFoodManager(manager: unknown): void {
    // Store reference for feeding behavior integration
    // Using unknown type to avoid circular dependency
    console.log('Food manager', manager ? 'connected' : 'disconnected');
  }

  /**
   * Clean up resources.
   */
  destroy(): void {
    this.gpuRunner?.destroy();
    this.birds = [];
  }
}


