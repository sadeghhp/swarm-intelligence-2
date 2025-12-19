import { createFlux, Flux } from '@flux-gpu/core';
import { Flock } from './simulation/Flock';
import { GPUSimulationRunner } from './simulation/gpu/GPUSimulationRunner';
import { FlockRenderer } from './rendering/FlockRenderer';
import { EnvironmentRenderer } from './rendering/EnvironmentRenderer';
import { TrailEffect } from './rendering/TrailEffect';
import { GlowEffect } from './rendering/GlowEffect';
import { Canvas2DRenderer } from './rendering/Canvas2DRenderer';
import { ControlPanel } from './ui/ControlPanel';
import { Statistics } from './ui/Statistics';
import { Wind, AttractorManager, FoodSourceManager, createPredator, BasePredator } from './environment';
import { createAttractor } from './environment/Attractor';
import type { ILoadedConfig, ISimulationConfig, IEnvironmentConfig, IRenderingConfig } from './types';

// Version: 2.4.0 - Increased maximum bird population to 20000

const MAX_BIRDS = 20000;

/**
 * Main application orchestrator.
 * Version: 2.4.0 - Increased maximum bird population to 20000.
 */
export class App {
  // Flux GPU context
  private flux: Flux | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private container: HTMLElement;

  // Simulation
  private flock: Flock;
  private wind: Wind;
  private attractors: AttractorManager;
  private foodManager: FoodSourceManager | null = null;
  private predators: BasePredator[] = [];

  // Rendering (flux-based or Canvas2D fallback)
  private flockRenderer: FlockRenderer | null = null;
  private envRenderer: EnvironmentRenderer | null = null;
  private trailEffect: TrailEffect | null = null;
  private glowEffect: GlowEffect | null = null;
  private canvas2DRenderer: Canvas2DRenderer | null = null;
  private useWebGPU: boolean = false;

  // UI
  private controlPanel: ControlPanel;
  private statistics: Statistics;

  // Configuration
  private simConfig: ISimulationConfig;
  private envConfig: IEnvironmentConfig;
  private renderConfig: IRenderingConfig;
  private config: ILoadedConfig;

  // State
  private lastTime: number = 0;
  private running: boolean = false;
  private gpuAvailable: boolean = false;

  constructor(container: HTMLElement, config: ILoadedConfig) {
    console.log('App v2.2.0 - WebGPU with Canvas2D fallback');
    this.container = container;
    this.config = config;
    this.simConfig = { ...config.simulation };
    this.envConfig = { ...config.environment };
    this.renderConfig = { ...config.rendering };

    // Initialize simulation components
    this.flock = new Flock(
      window.innerWidth,
      window.innerHeight,
      MAX_BIRDS,
      this.simConfig,
      this.envConfig
    );

    this.wind = new Wind(this.envConfig);
    this.attractors = new AttractorManager();

    // Initialize UI
    this.controlPanel = new ControlPanel(
      this.simConfig,
      this.envConfig,
      this.renderConfig,
      config.creaturePresets
    );

    this.statistics = new Statistics();
  }

  /**
   * Initialize the application.
   * Tries WebGPU first, falls back to Canvas2D if unavailable.
   */
  async init(): Promise<void> {
    // Create canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.canvas.style.display = 'block';
    this.container.appendChild(this.canvas);

    // Try WebGPU first
    let webgpuAvailable = false;
    
    // Check if WebGPU is supported at all
    console.log('Checking WebGPU support...');
    console.log('  navigator.gpu exists:', typeof navigator !== 'undefined' && 'gpu' in navigator);
    
    if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
      console.log('WebGPU API detected, attempting initialization...');
      try {
        // Test adapter request first
        console.log('  Requesting GPU adapter...');
        const testAdapter = await navigator.gpu.requestAdapter();
        console.log('  Adapter:', testAdapter ? 'obtained' : 'null');
        if (testAdapter) {
          console.log('  Adapter info:', testAdapter.info || 'no info');
        }
        
        // Create Flux instance
        // Removing powerPreference: 'high-performance' to improve compatibility on some devices
        console.log('  Creating Flux instance...');
        this.flux = await createFlux({
          canvas: this.canvas,
        });
        
        if (!this.flux) {
          throw new Error('Flux initialization returned null');
        }
        
        console.log('  Flux device:', this.flux.device ? 'obtained' : 'null');

        webgpuAvailable = true;
        this.useWebGPU = true;
        console.log('✓ WebGPU initialized successfully');
      } catch (error) {
        console.warn('WebGPU initialization failed:', error);
        if (error instanceof Error) {
            console.warn('Error details:', error.message, error.stack);
        }
        webgpuAvailable = false;
      }
    } else {
      console.log('WebGPU not supported in this browser');
      console.log('  navigator exists:', typeof navigator !== 'undefined');
      console.log('  navigator.gpu:', typeof navigator !== 'undefined' ? (navigator as any).gpu : 'N/A');
    }

    if (webgpuAvailable && this.flux) {
      // Initialize WebGPU renderers with error handling
      console.log('Initializing WebGPU renderers...');
      try {
        this.flockRenderer = new FlockRenderer(this.flux, this.renderConfig, MAX_BIRDS);
        this.envRenderer = new EnvironmentRenderer(this.flux, window.innerWidth, window.innerHeight);
        this.trailEffect = new TrailEffect(
          this.flux,
          MAX_BIRDS,
          this.renderConfig.trailLength,
          this.renderConfig.trailColor
        );
        // Initialize trail enabled state from config
        this.trailEffect.setEnabled(this.renderConfig.trailEnabled);
        
        // Initialize glow effect for fireflies (smaller, more subtle radius)
        this.glowEffect = new GlowEffect(this.flux, MAX_BIRDS, 12);
        this.glowEffect.setEnabled(this.renderConfig.glowEnabled || this.envConfig.fireflyEnabled);
        
        console.log('✓ WebGPU renderers initialized');
      } catch (error) {
        console.error('WebGPU renderer initialization failed:', error);
        console.log('Falling back to Canvas2D...');
        webgpuAvailable = false;
        this.useWebGPU = false;
        this.flux = null;
        this.flockRenderer = null;
        this.envRenderer = null;
        this.trailEffect = null;
        this.glowEffect = null;
      }

      if (webgpuAvailable && this.flux) {
        // Check GPU capabilities for compute
        console.log('Checking GPU compute capabilities...');
        const gpuCaps = await GPUSimulationRunner.checkCapabilities();
        this.gpuAvailable = gpuCaps.available;

        if (gpuCaps.available) {
          console.log('✓ WebGPU compute available:', gpuCaps.adapter);
          this.statistics.updateGpuStatus(true, 'Render + Compute');
          // Initialize GPU simulation with shared Flux device
          await this.flock.initGPUWithFlux(this.flux);
        } else {
          console.warn('WebGPU compute not available:', gpuCaps.reason);
          this.statistics.updateGpuStatus(true, 'Render Only');
        }
      }
    }
    
    // Fall back to Canvas2D if WebGPU not available
    if (!this.useWebGPU) {
      console.log('Using Canvas2D renderer...');
      this.canvas2DRenderer = new Canvas2DRenderer(this.canvas, this.renderConfig, MAX_BIRDS);
      this.statistics.updateGpuStatus(false, 'Canvas2D');
      console.log('✓ Canvas2D renderer initialized');
    }

    console.log('Spawning birds...');

    // Spawn initial birds
    this.flock.spawnBirds(this.simConfig.birdCount);

    // Setup control panel callbacks
    this.setupControlPanelCallbacks();

    // Setup event handlers
    this.setupEventHandlers();

    // Initialize optional systems
    if (this.envConfig.foodEnabled) {
      this.initFoodSystem();
    }

    if (this.envConfig.predatorEnabled) {
      this.spawnPredators();
    }
    
    console.log(`Initialization complete (${this.useWebGPU ? 'WebGPU' : 'Canvas2D'} mode)`);
  }

  /**
   * Setup control panel callbacks.
   */
  private setupControlPanelCallbacks(): void {
    this.controlPanel.setCallbacks({
      onPresetChange: (presetKey) => {
        console.log('Preset changed:', presetKey);
        this.flock.updateConfig(this.simConfig, this.envConfig);
        this.flock.setBirdCount(this.simConfig.birdCount);
        this.flockRenderer?.updateConfig(this.renderConfig);
        this.canvas2DRenderer?.updateConfig(this.renderConfig);
      },

      onBirdCountChange: (count) => {
        this.flock.setBirdCount(count);
      },

      onPredatorToggle: (enabled, _type) => {
        if (enabled) {
          this.spawnPredators();
        } else {
          this.predators = [];
        }
      },

      onFoodToggle: (enabled) => {
        if (enabled && !this.foodManager) {
          this.initFoodSystem();
        } else if (!enabled && this.foodManager) {
          this.foodManager.clear();
          this.foodManager = null;
        }
      },

      onConfigChange: () => {
        this.flock.updateConfig(this.simConfig, this.envConfig);
        this.wind.updateConfig(this.envConfig);
        this.flockRenderer?.updateConfig(this.renderConfig);
        this.canvas2DRenderer?.updateConfig(this.renderConfig);
        this.trailEffect?.setEnabled(this.renderConfig.trailEnabled);
        this.trailEffect?.updateConfig(this.renderConfig.trailLength, this.renderConfig.trailColor);
        // Update glow effect based on glow or firefly settings
        this.glowEffect?.setEnabled(this.renderConfig.glowEnabled || this.envConfig.fireflyEnabled);
      },

      onPauseResume: (paused) => {
        this.running = !paused;
        console.log(paused ? 'Simulation paused' : 'Simulation resumed');
      },

      onReset: () => {
        this.flock.reset();
        this.flock.spawnBirds(this.simConfig.birdCount);
        this.statistics.resetTime();
        this.attractors.clear();
        this.predators = [];
        if (this.envConfig.predatorEnabled) {
          this.spawnPredators();
        }
        console.log('Simulation reset');
      },

      onPerceptionRadiusChange: (radius) => {
        this.flock.setPerceptionRadius(radius);
      },

      onTrailsToggle: (enabled) => {
        this.trailEffect?.setEnabled(enabled);
        console.log('Trails', enabled ? 'enabled' : 'disabled');
      },

      onDayNightToggle: (enabled) => {
        console.log('Day/Night cycle', enabled ? 'enabled' : 'disabled');
      },

      onTerritoryToggle: (enabled) => {
        console.log('Territories', enabled ? 'enabled' : 'disabled');
      },

      onEcosystemToggle: (enabled) => {
        console.log('Multi-species ecosystem', enabled ? 'enabled' : 'disabled');
      },

      onPredatorTypeChange: (type) => {
        if (this.envConfig.predatorEnabled) {
          this.spawnPredators();
          console.log('Predator type changed to:', type);
        }
      },

      onPredatorCountChange: (count) => {
        if (this.envConfig.predatorEnabled) {
          this.spawnPredators();
          console.log('Predator count changed to:', count);
        }
      }
    });
  }

  /**
   * Setup event handlers.
   */
  private setupEventHandlers(): void {
    // Window resize
    window.addEventListener('resize', () => this.handleResize());

    // Mouse click - add attractor/repulsor
    if (this.canvas) {
      this.canvas.addEventListener('click', (e) => this.handleClick(e));
      this.canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.handleClick(e, true);
      });
    }

    // Keyboard
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));
  }

  /**
   * Initialize food system.
   */
  private initFoodSystem(): void {
    this.foodManager = new FoodSourceManager(
      window.innerWidth,
      window.innerHeight,
      {
        respawnTime: this.envConfig.foodRespawnTime,
        maxFeeders: this.envConfig.maxFeedersPerFood,
        gatherRadius: this.envConfig.gatherRadius,
        feedingDuration: this.envConfig.feedingDuration,
        attractionRadius: this.envConfig.foodAttractionRadius,
        foodEnergyRestore: this.simConfig.foodEnergyRestore
      }
    );

    this.foodManager.spawnFood(this.envConfig.foodCount, this.envConfig.foodRadius);
    
    // Connect food manager to flock for feeding behavior
    this.flock.setFoodManager(this.foodManager);
  }

  /**
   * Spawn predators based on predatorCount config.
   */
  private spawnPredators(): void {
    const count = this.envConfig.predatorCount || 1;
    this.predators = [];

    const margin = 100;
    const preset = this.config.predatorPresets[this.envConfig.predatorType];

    for (let i = 0; i < count; i++) {
      const x = margin + Math.random() * (window.innerWidth - margin * 2);
      const y = margin + Math.random() * (window.innerHeight - margin * 2);
      const predator = createPredator(i, this.envConfig.predatorType, x, y, preset);
      this.predators.push(predator);
    }

    console.log(`Spawned ${count} predator(s)`);
  }

  /**
   * Handle window resize.
   */
  private handleResize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;

    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    if (this.useWebGPU) {
      this.flux?.resize(width, height);
      this.envRenderer?.resize(width, height);
    } else {
      this.canvas2DRenderer?.resize(width, height);
    }
    
    this.flock.resize(width, height);
    this.foodManager?.resize(width, height);
  }

  /**
   * Handle mouse click.
   * - Left click: Add attractor
   * - Shift+Left click: Spawn food (if food enabled)
   * - Right click: Add repulsor
   */
  private handleClick(e: MouseEvent, isRepulsor: boolean = false): void {
    if (!this.canvas) return;
    
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Shift+Click to spawn food
    if (e.shiftKey && !isRepulsor && this.envConfig.foodEnabled) {
      // Initialize food system if not already
      if (!this.foodManager) {
        this.initFoodSystem();
      }
      if (this.foodManager) {
        this.foodManager.addFoodSource(x, y, this.envConfig.foodRadius, 100);
        console.log('Food spawned at', x, y);
      }
      return;
    }

    // Regular attractor/repulsor
    const attractor = createAttractor(
      x,
      y,
      isRepulsor ? 2.0 : 1.5,
      200,
      3.0,
      isRepulsor
    );

    this.flock.addAttractor(attractor);
    this.attractors.add(attractor);

    // If repulsor, also apply panic
    if (isRepulsor) {
      this.flock.applyPanicAtPosition(x, y, 200, 0.8);
    }
  }

  /**
   * Handle keyboard input.
   */
  private handleKeyDown(e: KeyboardEvent): void {
    switch (e.key.toLowerCase()) {
      case ' ':
        this.running = !this.running;
        break;
      case 'r':
        this.flock.spawnBirds(this.simConfig.birdCount);
        this.statistics.resetTime();
        break;
      case 'g':
        if (this.gpuAvailable && this.useWebGPU) {
          this.flock.setUseGPU(!this.flock.isUsingGPU);
          if (this.flock.isUsingGPU) {
            this.statistics.updateGpuStatus(true, 'Render + Compute');
          } else {
            this.statistics.updateGpuStatus(true, 'Render Only (CPU Sim)');
          }
        }
        break;
    }
  }

  /**
   * Update day/night cycle.
   */
  private updateDayNightCycle(deltaTime: number): void {
    if (!this.envConfig.dayNight?.enabled || this.envConfig.dayNight.freezeTime) {
      return;
    }

    const cycleDuration = this.envConfig.dayNight.cycleDuration || 120;
    const timeStep = deltaTime / cycleDuration;
    
    // Advance time of day
    this.envConfig.dayNight.timeOfDay += timeStep;
    
    // Wrap around at 1.0
    if (this.envConfig.dayNight.timeOfDay >= 1) {
      this.envConfig.dayNight.timeOfDay -= 1;
    }

    // Optional: adjust background color based on time
    // timeOfDay: 0 = midnight (dark), 0.5 = noon (bright), 1 = midnight
    const t = this.envConfig.dayNight.timeOfDay;
    const brightness = Math.sin(t * Math.PI); // 0 at midnight, 1 at noon
    
    // Interpolate between night color (0x050510) and day color (0x1a2030)
    const nightR = 0x05, nightG = 0x05, nightB = 0x10;
    const dayR = 0x1a, dayG = 0x20, dayB = 0x30;
    
    const r = Math.round(nightR + (dayR - nightR) * brightness);
    const g = Math.round(nightG + (dayG - nightG) * brightness);
    const b = Math.round(nightB + (dayB - nightB) * brightness);
    
    this.renderConfig.backgroundColor = (r << 16) | (g << 8) | b;
  }

  /**
   * Main game loop.
   */
  private async update(currentTime: number): Promise<void> {
    const deltaTime = Math.min((currentTime - this.lastTime) / 1000, 0.1);
    this.lastTime = currentTime;

    // Update FPS
    this.statistics.updateFps(deltaTime);

    if (this.running) {
      // Update simulation
      this.flock.update(deltaTime);

      // Sync GPU data back to CPU for rendering
      if (this.flock.isUsingGPU) {
        await this.flock.syncFromGPU();
      }

      // Update wind
      this.wind.update(deltaTime);

      // Update day/night cycle
      this.updateDayNightCycle(deltaTime);

      // Update attractors
      this.attractors.update(deltaTime);
      this.flock.updateAttractors(deltaTime);

      // Update predators
      if (this.predators.length > 0 && this.envConfig.predatorEnabled) {
        const birdArrays = this.flock.getBirdArrays();
        
        for (const predator of this.predators) {
          predator.update(
            deltaTime,
            birdArrays,
            window.innerWidth,
            window.innerHeight
          );

          // Apply panic from each predator
          this.flock.applyPanicAtPosition(
            predator.position.x,
            predator.position.y,
            predator.panicRadius,
            0.5
          );
        }
        
        // Set primary predator position for flock panic response
        const primaryPredator = this.predators[0];
        this.flock.setPredatorPosition(
          primaryPredator.position,
          primaryPredator.panicRadius
        );
      } else {
        // Clear predator influence
        this.flock.setPredatorPosition(null);
      }

      // Update food
      if (this.foodManager && this.envConfig.foodEnabled) {
        this.foodManager.update(deltaTime, this.flock.getBirdArrays());
      }

      // Update trail effect
      if (this.renderConfig.trailEnabled) {
        this.trailEffect?.update(this.flock.getBirdArrays());
      }

      // Update statistics with extended data
      const extStats = this.flock.getExtendedStats();
      const primaryPredator = this.predators[0];
      
      // Get day/night time if enabled
      const timeOfDay = this.envConfig.dayNight?.enabled 
        ? this.envConfig.dayNight.timeOfDay 
        : undefined;
      
      this.statistics.update(
        {
          fps: this.statistics.getFps(),
          birdCount: this.flock.birdCount,
          avgDensity: extStats.avgDensity,
          avgVelocity: extStats.avgSpeed,
          avgEnergy: extStats.avgEnergy,
          simulationTime: 0,
          // Predator stats (show primary predator state)
          predatorState: primaryPredator?.state,
          predatorType: this.envConfig.predatorEnabled ? this.envConfig.predatorType : undefined,
          predatorEnergy: primaryPredator?.energy,
          activePredators: this.predators.length,
          // Food stats
          activeFoodSources: this.foodManager?.getActiveFoodCount() ?? 0,
          feedingBirds: extStats.feedingBirds,
          // Gender and social stats
          maleCount: extStats.maleCount,
          femaleCount: extStats.femaleCount,
          activeMatingPairs: extStats.matingPairs,
          activeFights: extStats.fightingPairs,
          // Time
          timeOfDay
        },
        deltaTime
      );
    }

    // Render
    this.render();

    // Schedule next frame
    requestAnimationFrame((t) => this.update(t));
  }

  /**
   * Render all elements using Flux (WebGPU) or Canvas2D fallback.
   */
  private render(): void {
    const birdArrays = this.flock.getBirdArrays();
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    // Use Canvas2D fallback if WebGPU is not available
    if (!this.useWebGPU || !this.flux) {
      this.renderCanvas2D(birdArrays, screenWidth, screenHeight);
      return;
    }

    // WebGPU rendering path
    // Convert background color to RGBA
    const bg = this.renderConfig.backgroundColor;
    const bgR = ((bg >> 16) & 0xFF) / 255;
    const bgG = ((bg >> 8) & 0xFF) / 255;
    const bgB = (bg & 0xFF) / 255;

    // Create render pass
    const batch = this.flux.batch('frame');
    const view = this.flux.getCurrentTextureView();

    const renderPass = batch.renderPass({
      colorAttachments: [{
        view,
        clearValue: { r: bgR, g: bgG, b: bgB, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });

    const pass = renderPass.native;

    // Render trails (behind everything)
    if (this.renderConfig.trailEnabled && this.trailEffect) {
      this.trailEffect.render(pass, screenWidth, screenHeight);
    }

    // Render glow halos (behind birds, in front of trails)
    const shouldRenderGlow = (this.renderConfig.glowEnabled || this.envConfig.fireflyEnabled) && this.glowEffect;
    if (shouldRenderGlow) {
      // Use firefly glow color or default yellow-orange
      const glowColor = this.renderConfig.fireflyGlowColor ?? 0xffcc00;
      this.glowEffect!.render(pass, birdArrays, screenWidth, screenHeight, glowColor);
    }

    // Render environment (wind, food, attractors)
    if (this.envRenderer) {
      this.envRenderer.renderWind(
        pass,
        this.wind.getDirection(),
        this.wind.getSpeed(),
        this.envConfig.windEnabled
      );

      if (this.foodManager && this.envConfig.foodEnabled) {
        this.envRenderer.renderFood(pass, this.foodManager.getFoodSources());
      }

      this.envRenderer.renderAttractors(pass, this.attractors.getAll());

      // Render predators
      if (this.predators.length > 0 && this.envConfig.predatorEnabled) {
        this.envRenderer.renderPredators(pass, this.predators);
      }
    }

    // Render flock
    if (this.flockRenderer) {
      this.flockRenderer.render(pass, birdArrays, screenWidth, screenHeight);
    }

    renderPass.end();
    batch.submit();
  }

  /**
   * Render using Canvas2D fallback.
   */
  private renderCanvas2D(
    birdArrays: ReturnType<typeof this.flock.getBirdArrays>,
    screenWidth: number,
    screenHeight: number
  ): void {
    if (!this.canvas2DRenderer) return;

    // Update trails
    if (this.renderConfig.trailEnabled) {
      this.canvas2DRenderer.updateTrails(birdArrays);
    }

    // Get food sources
    const foodSources = this.foodManager?.getFoodSources() || [];

    // Get predators
    const predators = this.envConfig.predatorEnabled 
      ? this.predators 
      : [];

    // Render everything
    this.canvas2DRenderer.render(
      birdArrays,
      screenWidth,
      screenHeight,
      this.attractors.getAll(),
      foodSources,
      predators,
      this.envConfig.windEnabled,
      this.wind.getDirection(),
      this.wind.getSpeed()
    );
  }

  /**
   * Start the application.
   */
  start(): void {
    this.running = true;
    this.lastTime = performance.now();
    void this.update(this.lastTime);
  }

  /**
   * Stop the application.
   */
  stop(): void {
    this.running = false;
  }

  /**
   * Clean up resources.
   */
  destroy(): void {
    this.stop();
    this.flock.destroy();
    this.flockRenderer?.destroy();
    this.envRenderer?.destroy();
    this.trailEffect?.destroy();
    this.canvas2DRenderer?.destroy();
    this.controlPanel.destroy();
    this.flux?.destroy();
  }
}
