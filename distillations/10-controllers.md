# Swarm Controllers

## Overview

The swarm control system consists of multiple layers:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          CONTROL HIERARCHY                               │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                              App.ts                                      │
│                        (Main Orchestrator)                               │
│  • Initializes all subsystems                                           │
│  • Runs main game loop                                                   │
│  • Coordinates configuration sync                                        │
│  • Handles user input events                                             │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┬────────────────────┐
         │                   │                   │                    │
         ▼                   ▼                   ▼                    ▼
┌────────────────┐  ┌───────────────┐  ┌───────────────┐   ┌────────────────┐
│  ControlPanel  │  │    Flock      │  │   Renderers   │   │   Statistics   │
│  (User Input)  │  │ (Simulation)  │  │   (Display)   │   │  (Telemetry)   │
│   Tweakpane    │  │  State Mgmt   │  │   flux-gpu    │   │   DOM Update   │
└────────────────┘  └───────────────┘  └───────────────┘   └────────────────┘
```

---

## 1. App.ts - Main Orchestrator

### Responsibilities

1. Initialize flux-gpu renderer and canvas
2. Create and manage all subsystems (Flock, Renderers, Predators, Food)
3. Run the main game loop (update → render → statistics)
4. Handle window resize
5. Handle user input (click, right-click)
6. Sync configuration from UI to simulation

### Class Structure

```typescript
class App {
  // === flux-gpu ===
  private gpu: FluxGPU;
  private canvas: HTMLCanvasElement;
  
  // === Simulation ===
  private flock: Flock;
  private predators: BasePredator[];
  private currentPredatorType: PredatorType;
  private foodManager: FoodSourceManager;
  
  // === Rendering ===
  private flockRenderer: FlockRenderer;
  private envRenderer: EnvironmentRenderer;
  private trailEffect: TrailEffect;
  
  // === UI ===
  private controlPanel: ControlPanel;
  private statistics: Statistics;
  
  // === Configuration ===
  private simConfig: ISimulationConfig;
  private envConfig: IEnvironmentConfig;
  private renderConfig: IRenderingConfig;
  private loadedConfig: ILoadedConfig;
  
  // === Dimensions ===
  private width: number;
  private height: number;
  
  // === Timing ===
  private lastTime: number;
  private running: boolean;
}
```

### Initialization Flow

```typescript
async initialize(): Promise<void> {
  // 1. Calculate dimensions
  this.updateDimensions();
  
  // 2. Initialize flux-gpu
  this.gpu = new FluxGPU();
  await this.gpu.init({
    canvas: this.canvas,
    width: this.width,
    height: this.height,
    backgroundColor: [0.04, 0.04, 0.06, 1.0],
    antialias: true,
    devicePixelRatio: window.devicePixelRatio || 1
  });
  
  // 3. Create simulation
  this.flock = new Flock(this.width, this.height, this.simConfig, this.envConfig);
  
  // 4. Create predators
  this.initializePredators(this.currentPredatorType, this.envConfig.predatorCount || 1);
  
  // 5. Create food manager
  this.foodManager = new FoodSourceManager(this.width, this.height);
  this.flock.setFoodManager(this.foodManager);
  
  // 6. Create renderers (layered via render order)
  this.flockRenderer = new FlockRenderer(this.gpu, this.renderConfig);
  this.envRenderer = new EnvironmentRenderer(this.gpu, this.width, this.height, this.renderConfig);
  this.trailEffect = new TrailEffect(this.gpu);
  
  // Register render passes in order (back to front)
  this.gpu.addRenderPass(this.trailEffect.getRenderPass());   // Back layer
  this.gpu.addRenderPass(this.envRenderer.getRenderPass());   // Middle layer
  this.gpu.addRenderPass(this.flockRenderer.getRenderPass()); // Front layer
  
  // 7. Create UI
  this.initializeUI();
  this.statistics = new Statistics();
  
  // 8. Setup event listeners
  this.setupEventListeners();
  
  // 9. Initial sync
  this.flockRenderer.syncBirdCount(this.simConfig.birdCount);
}
```

### Game Loop

```typescript
private gameLoop(): void {
  if (!this.running) return;
  
  // Calculate delta time
  const now = performance.now();
  const deltaTime = Math.min((now - this.lastTime) / 1000, 0.1);
  this.lastTime = now;
  
  // 1. Sync configs from UI
  this.syncConfigs();
  
  // 2. Update simulation
  this.update(deltaTime);
  
  // 3. Render
  this.render();
  
  // 4. Update statistics
  this.updateStatistics();
  
  // 5. Next frame
  requestAnimationFrame(() => this.gameLoop());
}
```

### Configuration Synchronization

```typescript
private syncConfigs(): void {
  // Copy control panel configs to flock
  Object.assign(this.flock.config, this.controlPanel.simConfig);
  Object.assign(this.flock.envConfig, this.controlPanel.envConfig);
  
  // Update local refs
  this.simConfig = this.controlPanel.simConfig;
  this.envConfig = this.controlPanel.envConfig;
  this.renderConfig = this.controlPanel.renderConfig;
  
  // Sync to renderers
  this.flockRenderer.setColorByDensity(this.renderConfig.colorByDensity);
  this.flockRenderer.setColorBySpeed(this.renderConfig.colorBySpeed);
  this.flockRenderer.setTrailLength(this.renderConfig.trailLength);
  this.flockRenderer.setShape(this.renderConfig.particleShape);
  this.flockRenderer.setParticleSize(this.simConfig.particleSize);
  this.flockRenderer.setGlowEnabled(this.renderConfig.glowEnabled);
  this.flockRenderer.setGlowIntensity(this.renderConfig.glowIntensity);
  
  this.trailEffect.setMaxLength(this.renderConfig.trailLength);
  this.envRenderer.setWindParticlesEnabled(this.renderConfig.showWindParticles);
  this.envRenderer.setPredatorRangeEnabled(this.renderConfig.showPredatorRange);
}
```

### Event Handlers

```typescript
private setupEventListeners(): void {
  // Resize handler
  window.addEventListener('resize', () => this.handleResize());
  
  // Click: Add attractor (or food with Shift)
  this.canvas.addEventListener('click', (event) => this.handleClick(event));
  
  // Right-click: Add repulsor
  this.canvas.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    this.handleRightClick(event);
  });
}

private handleClick(event: MouseEvent): void {
  const rect = this.canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  
  if (this.envConfig.foodEnabled && event.shiftKey) {
    this.foodManager.spawnFood(x, y, this.envConfig.foodAttractionRadius);
  } else {
    this.flock.addAttractor(x, y, 1.0, 150, 8, false);
  }
}

private handleRightClick(event: MouseEvent): void {
  const rect = this.canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  
  this.flock.addAttractor(x, y, 1.5, 150, 8, true);
}

private handleResize(): void {
  this.updateDimensions();
  
  this.gpu.resize(this.width, this.height);
  this.flock.resize(this.width, this.height);
  this.envRenderer.resize(this.width, this.height);
  this.predators.forEach(p => p.resize(this.width, this.height));
  this.foodManager.resize(this.width, this.height);
}
```

---

## 2. ControlPanel - User Interface Controller

### Responsibilities

1. Create Tweakpane UI with categorized folders
2. Bind configuration objects to UI controls
3. Trigger callbacks when values change
4. Manage creature presets (built-in and custom)
5. Import/export custom presets (localStorage)

### Callback Interface

```typescript
interface ControlPanelCallbacks {
  onBirdCountChange: (count: number) => void;
  onPerceptionRadiusChange: (radius: number) => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onPredatorToggle: (enabled: boolean) => void;
  onPredatorTypeChange?: (type: PredatorType) => void;
  onPredatorCountChange?: (count: number) => void;
  onTrailsToggle: (enabled: boolean) => void;
  onPresetChange: (preset: CreaturePreset) => void;
  onFoodToggle: (enabled: boolean) => void;
  onColorChange: () => void;
  onDayNightToggle?: (enabled: boolean) => void;
  onTerritoryToggle?: (enabled: boolean) => void;
  onEcosystemToggle?: (enabled: boolean) => void;
}
```

### UI Folder Structure

```
Tweakpane (Simulation Parameters)
│
├── Creature Preset (expanded)
│   ├── Type dropdown (Starlings, Insects, Fish, etc.)
│   └── Info text
│
├── 💾 Custom Presets (collapsed)
│   ├── Saved dropdown
│   ├── Load Selected button
│   ├── Delete Selected button
│   ├── Name input
│   ├── Description input
│   ├── Save Current button
│   ├── Export All button
│   ├── Import button
│   └── Storage info
│
├── Simulation (expanded)
│   ├── Count slider
│   ├── Size slider
│   ├── Speed slider
│   ├── Max Velocity slider
│   ├── Agility slider
│   ├── Randomness slider
│   ├── Wander slider
│   ├── Wrap Edges toggle
│   ├── Pause/Resume button
│   └── Reset button
│
├── Swarm Behavior (collapsed)
│   ├── Alignment slider
│   ├── Cohesion slider
│   ├── Separation slider
│   ├── Vision Range slider
│   ├── Personal Space slider
│   ├── Field of View slider
│   ├── Edge Margin slider
│   └── Edge Force slider
│
├── Environment (collapsed)
│   ├── Wind subfolder
│   │   ├── Speed slider
│   │   ├── Direction slider
│   │   └── Turbulence slider
│   └── Predator subfolder
│       ├── Active toggle
│       ├── Type dropdown
│       ├── Count slider
│       ├── Speed slider
│       ├── Aggression slider
│       ├── Panic Range slider
│       ├── Panic Spread slider
│       └── Info text
│
├── Energy System (collapsed)
│   ├── Active toggle
│   ├── Decay Rate slider
│   ├── Min Speed % slider
│   └── Food Restore slider
│
├── Food & Hunting (collapsed)
│   ├── Food Sources subfolder
│   │   ├── Active toggle
│   │   ├── Count slider
│   │   ├── Attraction slider
│   │   ├── Range slider
│   │   └── Respawn slider
│   └── Hunting Behavior subfolder
│       ├── Active toggle
│       ├── Chase Speed slider
│       └── Detection slider
│
├── 💕 Mating & Competition (collapsed)
│   ├── Active toggle
│   ├── Search Range slider
│   ├── Attraction slider
│   ├── Duration slider
│   ├── Cooldown slider
│   ├── Fight Range slider
│   ├── Fight Intensity slider
│   ├── Female Pickiness slider
│   └── Info text
│
├── Multi-Species Ecosystem (collapsed)
│   ├── Active toggle
│   ├── Interaction Range slider
│   ├── Hunting Force slider
│   ├── Fleeing Force slider
│   └── Info text
│
├── Day/Night Cycle (collapsed)
│   ├── Active toggle
│   ├── Cycle duration slider
│   ├── Time of Day slider
│   ├── Freeze Time toggle
│   ├── Skip to Day button
│   └── Skip to Night button
│
├── Territories (collapsed)
│   ├── Active toggle
│   ├── Show Zones toggle
│   ├── Default Radius slider
│   ├── Pull Strength slider
│   └── Info text
│
├── Visual Style (collapsed)
│   ├── Shape dropdown
│   ├── Base Color picker
│   ├── Dense Color picker
│   ├── Panic Color picker
│   ├── Color by Density toggle
│   ├── Color by Speed toggle
│   ├── Glow Effect toggle
│   └── Glow Intensity slider
│
└── Effects (collapsed)
    ├── Motion Trails toggle
    ├── Trail Length slider
    ├── Motion Blur toggle
    ├── Wind Particles toggle
    ├── Predator Range toggle
    └── Food Sources toggle
```

### Control Binding Example

```typescript
private setupSimulationControls(): void {
  const folder = this.pane.addFolder({
    title: 'Simulation',
    expanded: true
  });
  
  // Bird count with callback
  folder.addBinding(this.simConfig, 'birdCount', {
    label: 'Count',
    min: 100,
    max: 5000,
    step: 100
  }).on('change', (ev) => {
    this.callbacks.onBirdCountChange(ev.value);
  });
  
  // Direct binding (no callback needed - synced each frame)
  folder.addBinding(this.simConfig, 'simulationSpeed', {
    label: 'Speed',
    min: 0.1,
    max: 3.0,
    step: 0.1
  });
  
  // Pause/Resume toggle button
  const pauseBtn = folder.addButton({ title: 'Pause' });
  pauseBtn.on('click', () => {
    this.simConfig.paused = !this.simConfig.paused;
    pauseBtn.title = this.simConfig.paused ? 'Resume' : 'Pause';
    if (this.simConfig.paused) {
      this.callbacks.onPause();
    } else {
      this.callbacks.onResume();
    }
  });
}
```

### Preset Application

```typescript
private applyPreset(preset: CreaturePreset): void {
  const presetConfig = this.creaturePresets[preset];
  
  // Apply to simulation config
  this.simConfig.creaturePreset = preset;
  this.simConfig.particleSize = presetConfig.particleSize;
  this.simConfig.maxSpeed = presetConfig.maxSpeed;
  this.simConfig.maxForce = presetConfig.maxForce;
  this.simConfig.perceptionRadius = presetConfig.perceptionRadius;
  this.simConfig.separationRadius = presetConfig.separationRadius;
  this.simConfig.alignmentWeight = presetConfig.alignmentWeight;
  this.simConfig.cohesionWeight = presetConfig.cohesionWeight;
  this.simConfig.separationWeight = presetConfig.separationWeight;
  this.simConfig.fieldOfView = presetConfig.fieldOfView;
  
  // Apply to render config
  this.renderConfig.baseColor = presetConfig.baseColor;
  this.renderConfig.denseColor = presetConfig.denseColor;
  this.renderConfig.panicColor = presetConfig.panicColor;
  this.renderConfig.glowEnabled = presetConfig.glowEnabled;
  this.renderConfig.glowIntensity = presetConfig.glowIntensity;
  
  // Refresh UI
  this.pane.refresh();
  this.callbacks.onColorChange();
  this.callbacks.onPerceptionRadiusChange(presetConfig.perceptionRadius);
}
```

### Custom Preset Management

```typescript
// Save current settings as preset
folder.addButton({ title: '💾 Save Current as New Preset' }).on('click', () => {
  const name = this.customPresetState.newPresetName.trim();
  if (!name) {
    this.showNotification('Enter a preset name', 'warning');
    return;
  }

  const desc = this.customPresetState.newPresetDesc.trim() || 'Custom preset';

  // Check if exists
  if (presetManager.hasPreset(name)) {
    if (!confirm(`Preset "${name}" exists. Overwrite?`)) return;
  }

  // Save to localStorage
  presetManager.savePreset(name, desc, this.simConfig, this.envConfig, this.renderConfig);
  
  // Update UI
  this.refreshPresetDropdown();
  this.showNotification(`Saved "${name}"`, 'success');
});

// Export all presets to JSON file
folder.addButton({ title: '📤 Export All Presets' }).on('click', () => {
  const json = presetManager.exportPresets();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = 'swarm-presets.json';
  a.click();
  
  URL.revokeObjectURL(url);
});

// Import presets from JSON file
folder.addButton({ title: '📥 Import Presets' }).on('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const text = await file.text();
    const count = presetManager.importPresets(text, false);
    this.refreshPresetDropdown();
    this.showNotification(`Imported ${count} presets`, 'success');
  };

  input.click();
});
```

---

## 3. Statistics - Telemetry Display

### Responsibilities

1. Calculate and display FPS
2. Update DOM with simulation metrics
3. Color-code values for quick visual feedback

### Class Structure

```typescript
class Statistics {
  private fpsElement: HTMLElement | null;
  private birdsElement: HTMLElement | null;
  private densityElement: HTMLElement | null;
  private velocityElement: HTMLElement | null;
  private timeElement: HTMLElement | null;
  private predatorElement: HTMLElement | null;
  
  private frameCount: number = 0;
  private lastFpsTime: number = 0;
  private currentFps: number = 60;
}
```

### FPS Calculation

```typescript
update(stats: ISimulationStats): void {
  // FPS calculation (per second)
  this.frameCount++;
  const now = performance.now();
  if (now - this.lastFpsTime >= 1000) {
    this.currentFps = Math.round(this.frameCount * 1000 / (now - this.lastFpsTime));
    this.frameCount = 0;
    this.lastFpsTime = now;
  }
  
  // Update FPS display with color coding
  if (this.fpsElement) {
    this.fpsElement.textContent = this.currentFps.toString();
    if (this.currentFps >= 55) {
      this.fpsElement.style.color = 'var(--accent-cyan)';  // Good
    } else if (this.currentFps >= 30) {
      this.fpsElement.style.color = '#ffaa00';              // Warning
    } else {
      this.fpsElement.style.color = '#ff6666';              // Bad
    }
  }
}
```

### Predator State Display

```typescript
if (this.predatorElement) {
  if (stats.activeFood !== undefined && stats.activeFood > 0) {
    // Food mode
    this.predatorElement.textContent = `${stats.activeFood} Food`;
    this.predatorElement.style.color = '#88ff88';
  } else if (stats.activePredators > 0) {
    // Predator mode
    const typeStr = stats.predatorType ? this.capitalizeFirst(stats.predatorType) : 'Predator';
    const stateStr = this.capitalizeFirst(stats.predatorState);
    this.predatorElement.textContent = `${typeStr}: ${stateStr}`;
    
    // Color by state
    switch (stats.predatorState) {
      case 'hunting':
      case 'stalking':
      case 'scanning':
        this.predatorElement.style.color = '#ffaa00';  // Active
        break;
      case 'attacking':
      case 'diving':
        this.predatorElement.style.color = '#ff6666';  // Danger
        break;
      case 'ambushing':
        this.predatorElement.style.color = '#9b59b6';  // Stealth
        break;
      case 'recovering':
        this.predatorElement.style.color = '#888888';  // Resting
        break;
      default:
        this.predatorElement.style.color = 'var(--text-muted)';
    }
  } else {
    this.predatorElement.textContent = 'No Predator';
    this.predatorElement.style.color = 'var(--text-muted)';
  }
}
```

---

## 4. Flock - Simulation State Controller

### Responsibilities

1. Manage bird entity collection
2. Execute fixed-timestep physics loop
3. Coordinate spatial partitioning
4. Apply all forces (swarm, environmental, behavioral)
5. Manage feeding state machine per bird
6. Manage mating state machine per bird
7. Track simulation statistics

### State Management

```typescript
class Flock {
  public birds: Bird[] = [];
  public config: ISimulationConfig;
  public envConfig: IEnvironmentConfig;
  
  private spatialGrid: SpatialGrid;
  private rules: SwarmRules;
  private foodManager: FoodSourceManager | null = null;
  
  private attractors: IAttractor[] = [];
  private predatorPosition: Vector2 | null = null;
  private predatorPanicRadius: number = 150;
  
  private simulationTime: number = 0;
  private accumulator: number = 0;
  private readonly fixedDeltaTime: number = 1 / 60;
  
  private stats: ISimulationStats;
}
```

### Update Pipeline

```typescript
update(deltaTime: number): void {
  if (this.config.paused) return;
  
  // Clamp to prevent spiral of death
  deltaTime = Math.min(deltaTime, 0.1);
  
  // Accumulate time
  this.accumulator += deltaTime * this.config.simulationSpeed;
  
  // Update noise time
  this.rules.update(deltaTime);
  
  // Fixed timestep physics
  while (this.accumulator >= this.fixedDeltaTime) {
    this.fixedUpdate(this.fixedDeltaTime);
    this.accumulator -= this.fixedDeltaTime;
    this.simulationTime += this.fixedDeltaTime;
  }
  
  // Decay attractors
  this.updateAttractors(deltaTime);
  
  // Update stats
  this.updateStats();
}
```

### Per-Bird Update Order

```typescript
private fixedUpdate(dt: number): void {
  // Step 1: Rebuild spatial grid
  this.spatialGrid.clear();
  this.spatialGrid.insertAll(this.birds);
  
  for (const bird of this.birds) {
    // Step 2: Update feeding state machine
    if (hasFood && energyEnabled) {
      this.updateFeedingState(bird, dt);
    }
    
    // Step 3: Get neighbors
    const neighbors = this.spatialGrid.getNeighbors(
      bird, this.birds, this.config.perceptionRadius, this.config.fieldOfView
    );
    
    // Step 4: Apply forces based on state
    if (bird.feedingState === 'none') {
      // Normal flocking
      this.rules.calculate(bird, neighbors, this.config, this.envConfig, this.simulationTime, tempSwarmForce);
      bird.applyForce(tempSwarmForce);
      
      // Wind
      if (hasWind) { this.calculateWindForce(bird, tempWindForce); bird.applyForce(tempWindForce); }
      
      // Attractors
      for (const attractor of this.attractors) {
        this.rules.calculateAttractorForce(bird, attractor.position.x, attractor.position.y, ...);
        bird.applyForce(tempAttractorForce);
      }
      
      // Food seeking (if hungry)
      if (hasFood && energyEnabled && bird.energy < 0.7) {
        // Apply food attraction force
      }
    } else {
      // Feeding-specific forces
      this.applyFeedingForces(bird, neighbors, dt);
    }
    
    // Step 5: Predator panic (always active, can interrupt feeding)
    if (hasPredator) {
      this.rules.calculatePanicResponse(bird, this.predatorPosition, ...);
      bird.applyForce(tempPanicForce);
      
      // Interrupt feeding if panicking
      if (bird.panicLevel > 0.5 && bird.feedingState !== 'none') {
        this.exitFeedingState(bird);
      }
      
      // Propagate panic
      if (bird.panicLevel > 0.3) {
        for (const neighbor of neighbors) {
          neighbor.applyPanic(bird.panicLevel * this.envConfig.panicDecay * 0.5);
        }
      }
    }
    
    // Step 6: Mating behavior
    if (this.envConfig.matingEnabled) {
      this.updateMatingBehavior(bird, neighbors, dt);
    }
    
    // Step 7: Boundary avoidance
    bird.applyBoundaryForce(this.width, this.height, this.config.boundaryMargin, this.config.boundaryForce);
    
    // Step 8: Physics update
    bird.update(dt, this.config, energyEnabled, this.config.energyDecayRate, this.config.minEnergySpeed);
  }
}
```

### Public Control Methods

```typescript
// Bird count management
setBirdCount(count: number): void;

// Spatial grid updates
setPerceptionRadius(radius: number): void;

// Attractors
addAttractor(x, y, strength, radius, lifetime, isRepulsor): number;
removeAttractor(id: number): void;
getAttractors(): IAttractor[];

// Predator state
setPredatorPosition(position: Vector2 | null, panicRadius?: number): void;

// Food integration
setFoodManager(manager: FoodSourceManager): void;

// Statistics
getStats(): ISimulationStats;
setFPS(fps: number): void;

// Lifecycle
resize(width: number, height: number): void;
reset(): void;
```

---

## 5. Predator Controller

### Initialization

```typescript
// In App.ts
private initializePredators(type: PredatorType, count: number): void {
  this.predators = PredatorFactory.createMultiple(type, count, this.width, this.height);
  this.currentPredatorType = type;
}
```

### Update Integration

```typescript
// In App.update()
if (this.envConfig.predatorEnabled && this.predators.length > 0) {
  const flockCenter = this.calculateFlockCenter();
  
  // Update each predator AI
  for (const predator of this.predators) {
    predator.update(deltaTime, this.envConfig, this.flock.birds, flockCenter);
  }
  
  // Set primary predator for flock panic response
  this.flock.setPredatorPosition(
    this.predators[0].position,
    this.predators[0].getEffectivePanicRadius()
  );
  
  // Apply panic from all predators
  this.applyPredatorPanic();
} else {
  this.flock.setPredatorPosition(null);
}
```

### Predator Type Change Callback

```typescript
// In ControlPanel callbacks
onPredatorTypeChange: (type: PredatorType) => {
  this.initializePredators(type, this.envConfig.predatorCount || 1);
},
onPredatorCountChange: (count: number) => {
  this.initializePredators(this.currentPredatorType, count);
}
```

---

## 6. Food Controller

### Initialization

```typescript
// In App.initialize()
this.foodManager = new FoodSourceManager(this.width, this.height);
this.flock.setFoodManager(this.foodManager);
```

### Update Integration

```typescript
// In App.update()
if (this.envConfig.foodEnabled) {
  this.foodManager.update(deltaTime, this.envConfig);
  this.applyFoodAttraction();
}
```

### Toggle Callback

```typescript
// In ControlPanel callbacks
onFoodToggle: (enabled) => {
  if (enabled) {
    this.foodManager.initialize(this.envConfig);
  } else {
    this.foodManager.clear();
  }
}
```

---

## 7. Configuration Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      CONFIGURATION DATA FLOW                            │
└─────────────────────────────────────────────────────────────────────────┘

                          ┌──────────────────┐
                          │  config.json     │
                          │  (Initial Load)  │
                          └────────┬─────────┘
                                   │
                                   ▼
                          ┌──────────────────┐
                          │  ConfigLoader    │
                          │  loadConfig()    │
                          └────────┬─────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
                    ▼                             ▼
          ┌──────────────────┐          ┌──────────────────┐
          │  App Constructor │          │   ControlPanel   │
          │                  │          │   Constructor    │
          │ simConfig = {...}│          │ simConfig = {...}│
          │ envConfig = {...}│          │ envConfig = {...}│
          │renderConfig= {...}│         │renderConfig= {...}│
          └────────┬─────────┘          └────────┬─────────┘
                   │                             │
                   │          Shared Objects     │
                   └─────────────┬───────────────┘
                                 │
                                 ▼
                     ┌───────────────────────┐
                     │    syncConfigs()      │
                     │   (Called each frame) │
                     └───────────┬───────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│     Flock       │    │  FlockRenderer  │    │  EnvironRenderer│
│   .config       │    │   .setXxx()     │    │   .setXxx()     │
│   .envConfig    │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

---

## 8. Input Control Summary

| Input | Handler | Action |
|-------|---------|--------|
| Left Click | `handleClick()` | Add attractor at position |
| Shift+Click | `handleClick()` | Spawn food source (if food enabled) |
| Right Click | `handleRightClick()` | Add repulsor at position |
| Window Resize | `handleResize()` | Resize canvas and all subsystems |
| Tweakpane Controls | Callbacks | Modify simulation parameters |

---

## 9. Attractor Lifecycle

```typescript
// Adding attractor
flock.addAttractor(x, y, strength, radius, lifetime, isRepulsor): number;
// Returns unique ID

// Automatic decay (in Flock.update)
private updateAttractors(deltaTime: number): void {
  for (let i = this.attractors.length - 1; i >= 0; i--) {
    this.attractors[i].lifetime -= deltaTime;
    if (this.attractors[i].lifetime <= 0) {
      this.attractors.splice(i, 1);
    }
  }
}

// Manual removal
flock.removeAttractor(id: number): void;
```

---

## 10. Statistics Data Structure

```typescript
interface ISimulationStats {
  fps: number;
  birdCount: number;
  averageDensity: number;
  averageVelocity: number;
  averageEnergy: number;
  simulationTime: number;
  predatorState: PredatorBehaviorState;
  predatorType?: PredatorType;
  predatorEnergy?: number;
  activePredators: number;
  foodConsumed: number;
  activeFood: number;
  maleCount: number;
  femaleCount: number;
  activeMatingPairs: number;
  activeFights: number;
}
```

Statistics are computed once per frame in `Flock.updateStats()` and read by `Statistics.update()`.
