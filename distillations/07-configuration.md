# Configuration System

## Overview

The configuration system has three layers:
1. **Static Config** (`public/config.json`) - Default values loaded at startup
2. **Runtime Config** (JavaScript objects) - Modified by UI in real-time
3. **Custom Presets** (localStorage) - User-saved configurations

```
┌───────────────────────────────────────────────────────────────────┐
│                     CONFIGURATION FLOW                            │
└───────────────────────────────────────────────────────────────────┘

  /public/config.json ─────► ConfigLoader.loadConfig()
                                    │
                                    ▼
                            ┌───────────────┐
                            │ loadedConfig  │  (Global module state)
                            │  .simulation  │
                            │  .environment │
                            │  .rendering   │
                            │  .presets     │
                            └───────┬───────┘
                                    │
                   ┌────────────────┼────────────────┐
                   │                │                │
                   ▼                ▼                ▼
            ┌──────────┐     ┌──────────┐     ┌──────────┐
            │   App    │     │   Flock  │     │ Renderers│
            │ .simConfig│    │ .config  │     │ .config  │
            │ .envConfig│    │ .envConfig│    │          │
            └────┬─────┘     └──────────┘     └──────────┘
                 │
                 │ References shared by UI
                 ▼
          ┌─────────────┐
          │ControlPanel │◄────► User input
          │  (Tweakpane)│
          └─────────────┘
                 │
                 ▼
          ┌─────────────┐
          │ localStorage│  Custom presets
          └─────────────┘
```

---

## Configuration File Structure

### `/public/config.json`

```json
{
  "simulation": {
    "birdCount": 2000,
    "particleSize": 1.0,
    "maxSpeed": 15,
    "maxForce": 0.5,
    "perceptionRadius": 50,
    "separationRadius": 25,
    "alignmentWeight": 1.0,
    "cohesionWeight": 1.0,
    "separationWeight": 1.5,
    "fieldOfView": 270,
    "boundaryMargin": 100,
    "boundaryForce": 0.8,
    "simulationSpeed": 1.0,
    "noiseStrength": 0.05,
    "wanderStrength": 0.1,
    "energyEnabled": false,
    "energyDecayRate": 0.02,
    "minEnergySpeed": 0.3,
    "foodEnergyRestore": 0.3
  },
  "environment": {
    "windEnabled": true,
    "windSpeed": 0.3,
    "windDirection": 45,
    "windTurbulence": 0.1,
    "predatorEnabled": false,
    "predatorType": "hawk",
    "panicRadius": 150,
    "panicDecay": 0.05,
    "panicSpread": 0.5,
    "foodEnabled": false,
    "foodCount": 3,
    "foodRadius": 100,
    "foodRespawnTime": 10,
    "foodAttractionRadius": 200,
    "maxFeedersPerFood": 10,
    "gatherRadius": 50,
    "feedingDuration": 2.0,
    "matingEnabled": false,
    "mateSearchRadius": 80,
    "mateAttractionStrength": 0.8,
    "courtingDistance": 30,
    "matingDistance": 15,
    "matingDuration": 3.0,
    "matingCooldown": 8.0,
    "fightRadius": 50,
    "fightDuration": 1.5,
    "fightStrength": 1.2,
    "panicSuppressesMating": true,
    "energyThresholdForMating": 0.4,
    "femaleSelectivity": 0.3
  },
  "rendering": {
    "backgroundColor": "0x1a1a2e",
    "particleColor": "0xFFFFFF",
    "particleShape": "arrow",
    "antialias": true,
    "colorMode": "density",
    "lowDensityColor": "0x4444FF",
    "highDensityColor": "0xFF4444",
    "slowColor": "0x4444FF",
    "fastColor": "0xFFFF44",
    "calmColor": "0x44FF44",
    "panicColor": "0xFF4444",
    "maleColor": "0x4488FF",
    "femaleColor": "0xFF88AA",
    "trailEnabled": false,
    "trailLength": 20,
    "trailColor": "0xFFFFFF",
    "glowEnabled": false,
    "glowIntensity": 0.5
  },
  "creaturePresets": {
    "starlings": {
      "name": "Starlings",
      "birdCount": 2000,
      "maxSpeed": 15,
      "maxForce": 0.5,
      "perceptionRadius": 50,
      "separationRadius": 25,
      "alignmentWeight": 1.0,
      "cohesionWeight": 1.0,
      "separationWeight": 1.5,
      "fieldOfView": 270,
      "particleSize": 1.0
    },
    "insects": {
      "name": "Insect Swarm",
      "birdCount": 3000,
      "maxSpeed": 25,
      "maxForce": 1.2,
      "perceptionRadius": 30,
      "separationRadius": 15,
      "alignmentWeight": 0.5,
      "cohesionWeight": 1.5,
      "separationWeight": 2.0,
      "fieldOfView": 360,
      "particleSize": 0.5
    }
    // ... more presets
  },
  "predatorPresets": {
    "hawk": {
      "name": "Hawk",
      "maxSpeed": 18,
      "panicRadius": 120,
      "huntingStyle": "edge",
      "color": "0xCC6600"
    }
    // ... more predator presets
  }
}
```

---

## ConfigLoader

### File: `src/config/ConfigLoader.ts`

### Loading Configuration

```typescript
// Module-level state
let loadedConfig: ILoadedConfig | null = null;

export async function loadConfig(url: string = '/config.json'): Promise<ILoadedConfig> {
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      console.warn(`Failed to load config from ${url}, using defaults`);
      return getDefaultConfig();
    }
    
    const json = await response.json();
    
    // Convert hex color strings to numbers
    const config = processConfig(json);
    
    return config;
  } catch (error) {
    console.warn('Error loading config:', error);
    return getDefaultConfig();
  }
}

export function setConfig(config: ILoadedConfig): void {
  loadedConfig = config;
}

export function getConfig(): ILoadedConfig {
  if (!loadedConfig) {
    console.warn('Config not loaded, returning defaults');
    return getDefaultConfig();
  }
  return loadedConfig;
}
```

### Color Conversion

```typescript
function convertColorValue(value: string | number): number {
  if (typeof value === 'string') {
    // Handle "0xRRGGBB" format
    if (value.startsWith('0x')) {
      return parseInt(value, 16);
    }
    // Handle "#RRGGBB" format
    if (value.startsWith('#')) {
      return parseInt(value.slice(1), 16);
    }
    // Try parsing as decimal
    return parseInt(value, 10);
  }
  return value;
}

function processConfig(raw: any): ILoadedConfig {
  const config = { ...raw };
  
  // Process rendering colors
  if (config.rendering) {
    const colorFields = [
      'backgroundColor', 'particleColor', 'lowDensityColor', 'highDensityColor',
      'slowColor', 'fastColor', 'calmColor', 'panicColor', 
      'maleColor', 'femaleColor', 'trailColor'
    ];
    
    for (const field of colorFields) {
      if (config.rendering[field] !== undefined) {
        config.rendering[field] = convertColorValue(config.rendering[field]);
      }
    }
  }
  
  // Process predator preset colors
  if (config.predatorPresets) {
    for (const key of Object.keys(config.predatorPresets)) {
      if (config.predatorPresets[key].color) {
        config.predatorPresets[key].color = convertColorValue(config.predatorPresets[key].color);
      }
    }
  }
  
  return config;
}
```

### Default Configuration

```typescript
function getDefaultConfig(): ILoadedConfig {
  return {
    simulation: {
      birdCount: 2000,
      particleSize: 1.0,
      maxSpeed: 15,
      maxForce: 0.5,
      perceptionRadius: 50,
      separationRadius: 25,
      alignmentWeight: 1.0,
      cohesionWeight: 1.0,
      separationWeight: 1.5,
      fieldOfView: 270,
      boundaryMargin: 100,
      boundaryForce: 0.8,
      simulationSpeed: 1.0,
      noiseStrength: 0.05,
      wanderStrength: 0.1,
      energyEnabled: false,
      energyDecayRate: 0.02,
      minEnergySpeed: 0.3,
      foodEnergyRestore: 0.3
    },
    environment: {
      windEnabled: true,
      windSpeed: 0.3,
      windDirection: 45,
      windTurbulence: 0.1,
      predatorEnabled: false,
      predatorType: 'hawk',
      panicRadius: 150,
      panicDecay: 0.05,
      panicSpread: 0.5,
      foodEnabled: false,
      foodCount: 3,
      foodRadius: 100,
      foodRespawnTime: 10,
      foodAttractionRadius: 200,
      maxFeedersPerFood: 10,
      gatherRadius: 50,
      feedingDuration: 2.0,
      matingEnabled: false,
      mateSearchRadius: 80,
      mateAttractionStrength: 0.8,
      courtingDistance: 30,
      matingDistance: 15,
      matingDuration: 3.0,
      matingCooldown: 8.0,
      fightRadius: 50,
      fightDuration: 1.5,
      fightStrength: 1.2,
      panicSuppressesMating: true,
      energyThresholdForMating: 0.4,
      femaleSelectivity: 0.3
    },
    rendering: {
      backgroundColor: 0x1a1a2e,
      particleColor: 0xFFFFFF,
      particleShape: 'arrow',
      antialias: true,
      colorMode: 'density',
      lowDensityColor: 0x4444FF,
      highDensityColor: 0xFF4444,
      // ... all other fields
    },
    creaturePresets: { /* ... */ },
    predatorPresets: { /* ... */ }
  };
}
```

---

## Creature Presets

### ICreaturePreset Interface

```typescript
interface ICreaturePreset {
  name: string;
  birdCount: number;
  maxSpeed: number;
  maxForce: number;
  perceptionRadius: number;
  separationRadius: number;
  alignmentWeight: number;
  cohesionWeight: number;
  separationWeight: number;
  fieldOfView: number;
  particleSize: number;
}
```

### Built-in Presets

| Preset | birdCount | maxSpeed | maxForce | perception | separation | align | cohesion | sep |
|--------|-----------|----------|----------|------------|------------|-------|----------|-----|
| Starlings | 2000 | 15 | 0.5 | 50 | 25 | 1.0 | 1.0 | 1.5 |
| Insects | 3000 | 25 | 1.2 | 30 | 15 | 0.5 | 1.5 | 2.0 |
| Fish | 1500 | 10 | 0.3 | 60 | 20 | 1.5 | 1.2 | 1.0 |
| Bats | 1000 | 20 | 0.7 | 40 | 30 | 0.8 | 1.0 | 1.8 |
| Fireflies | 500 | 5 | 0.2 | 80 | 40 | 0.3 | 0.5 | 1.0 |
| Ants | 2500 | 8 | 0.4 | 25 | 10 | 0.6 | 1.8 | 2.5 |
| Butterflies | 800 | 6 | 0.3 | 70 | 35 | 0.4 | 0.6 | 1.2 |
| Drones | 500 | 30 | 1.0 | 100 | 50 | 1.2 | 0.8 | 1.5 |
| Locusts | 4000 | 30 | 1.5 | 35 | 18 | 1.8 | 2.0 | 0.5 |
| Bees | 2000 | 18 | 0.8 | 45 | 22 | 1.0 | 1.3 | 1.6 |
| Pigeons | 300 | 12 | 0.4 | 80 | 40 | 1.3 | 1.5 | 1.2 |
| Sparrows | 1200 | 14 | 0.6 | 55 | 28 | 1.1 | 1.1 | 1.4 |

### Applying Presets

```typescript
// In ControlPanel
applyPreset(presetKey: string): void {
  const preset = this.presets[presetKey] || this.customPresets[presetKey];
  if (!preset) return;
  
  // Apply to simulation config
  this.simConfig.birdCount = preset.birdCount;
  this.simConfig.maxSpeed = preset.maxSpeed;
  this.simConfig.maxForce = preset.maxForce;
  this.simConfig.perceptionRadius = preset.perceptionRadius;
  this.simConfig.separationRadius = preset.separationRadius;
  this.simConfig.alignmentWeight = preset.alignmentWeight;
  this.simConfig.cohesionWeight = preset.cohesionWeight;
  this.simConfig.separationWeight = preset.separationWeight;
  this.simConfig.fieldOfView = preset.fieldOfView;
  this.simConfig.particleSize = preset.particleSize;
  
  // Refresh UI bindings
  this.pane.refresh();
  
  // Notify callback
  this.onPresetChange?.(presetKey);
}
```

---

## PresetManager

### File: `src/config/PresetManager.ts`

Manages custom preset storage in localStorage.

### Storage Key

```typescript
const STORAGE_KEY = 'swarm-simulator-custom-presets';
```

### Interface

```typescript
class PresetManager {
  private customPresets: Map<string, ICreaturePreset>;
  
  constructor() {
    this.customPresets = this.loadFromStorage();
  }
  
  // Core methods
  savePreset(name: string, config: ISimulationConfig): void;
  loadPreset(name: string): ICreaturePreset | null;
  deletePreset(name: string): boolean;
  listPresets(): string[];
  
  // Import/Export
  exportPresets(): string;
  importPresets(json: string): boolean;
}
```

### Save Preset

```typescript
savePreset(name: string, config: ISimulationConfig): void {
  const preset: ICreaturePreset = {
    name,
    birdCount: config.birdCount,
    maxSpeed: config.maxSpeed,
    maxForce: config.maxForce,
    perceptionRadius: config.perceptionRadius,
    separationRadius: config.separationRadius,
    alignmentWeight: config.alignmentWeight,
    cohesionWeight: config.cohesionWeight,
    separationWeight: config.separationWeight,
    fieldOfView: config.fieldOfView,
    particleSize: config.particleSize
  };
  
  this.customPresets.set(name, preset);
  this.saveToStorage();
}
```

### Storage Operations

```typescript
private loadFromStorage(): Map<string, ICreaturePreset> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return new Map();
    
    const parsed = JSON.parse(stored);
    return new Map(Object.entries(parsed));
  } catch (error) {
    console.warn('Failed to load custom presets:', error);
    return new Map();
  }
}

private saveToStorage(): void {
  try {
    const obj = Object.fromEntries(this.customPresets);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch (error) {
    console.warn('Failed to save custom presets:', error);
  }
}
```

### Export/Import

```typescript
exportPresets(): string {
  const obj = Object.fromEntries(this.customPresets);
  return JSON.stringify(obj, null, 2);
}

importPresets(json: string): boolean {
  try {
    const parsed = JSON.parse(json);
    
    // Validate structure
    for (const [key, preset] of Object.entries(parsed)) {
      if (!this.isValidPreset(preset as any)) {
        throw new Error(`Invalid preset: ${key}`);
      }
    }
    
    // Merge with existing
    for (const [key, preset] of Object.entries(parsed)) {
      this.customPresets.set(key, preset as ICreaturePreset);
    }
    
    this.saveToStorage();
    return true;
  } catch (error) {
    console.error('Import failed:', error);
    return false;
  }
}

private isValidPreset(obj: any): obj is ICreaturePreset {
  return (
    typeof obj === 'object' &&
    typeof obj.name === 'string' &&
    typeof obj.birdCount === 'number' &&
    typeof obj.maxSpeed === 'number' &&
    typeof obj.maxForce === 'number' &&
    typeof obj.perceptionRadius === 'number' &&
    typeof obj.separationRadius === 'number' &&
    typeof obj.alignmentWeight === 'number' &&
    typeof obj.cohesionWeight === 'number' &&
    typeof obj.separationWeight === 'number' &&
    typeof obj.fieldOfView === 'number' &&
    typeof obj.particleSize === 'number'
  );
}
```

---

## ControlPanel Integration

### File: `src/ui/ControlPanel.ts`

Uses Tweakpane library for real-time parameter editing.

### Tweakpane Structure

```typescript
class ControlPanel {
  private pane: Pane;
  private simConfig: ISimulationConfig;
  private envConfig: IEnvironmentConfig;
  private renderConfig: IRenderingConfig;
  
  // Callbacks
  onPresetChange?: (presetKey: string) => void;
  onBirdCountChange?: (count: number) => void;
  onPredatorToggle?: (enabled: boolean, type: PredatorType) => void;
  onFoodToggle?: (enabled: boolean) => void;
}
```

### Creating Folders

```typescript
private createSimulationFolder(): void {
  const folder = this.pane.addFolder({ title: 'Simulation' });
  
  // Preset dropdown
  folder.addBlade({
    view: 'list',
    label: 'Preset',
    options: this.getPresetOptions(),
    value: 'starlings'
  }).on('change', (ev) => {
    this.applyPreset(ev.value);
  });
  
  // Bird count with special handling
  folder.addBinding(this.simConfig, 'birdCount', {
    min: 100, max: 10000, step: 100, label: 'Bird Count'
  }).on('change', (ev) => {
    this.onBirdCountChange?.(ev.value);
  });
  
  // Speed parameters
  folder.addBinding(this.simConfig, 'maxSpeed', { min: 1, max: 50, label: 'Max Speed' });
  folder.addBinding(this.simConfig, 'maxForce', { min: 0.1, max: 3, label: 'Max Force' });
  
  // Perception
  folder.addBinding(this.simConfig, 'perceptionRadius', { min: 10, max: 200, label: 'Perception' });
  folder.addBinding(this.simConfig, 'separationRadius', { min: 5, max: 100, label: 'Separation' });
  folder.addBinding(this.simConfig, 'fieldOfView', { min: 90, max: 360, label: 'FOV (°)' });
  
  // Rule weights
  folder.addBinding(this.simConfig, 'alignmentWeight', { min: 0, max: 3, label: 'Alignment' });
  folder.addBinding(this.simConfig, 'cohesionWeight', { min: 0, max: 3, label: 'Cohesion' });
  folder.addBinding(this.simConfig, 'separationWeight', { min: 0, max: 3, label: 'Separation' });
  
  // Simulation speed
  folder.addBinding(this.simConfig, 'simulationSpeed', { min: 0.1, max: 3, label: 'Speed' });
}
```

### Environment Folder

```typescript
private createEnvironmentFolder(): void {
  const folder = this.pane.addFolder({ title: 'Environment', expanded: false });
  
  // Wind sub-folder
  const windFolder = folder.addFolder({ title: 'Wind' });
  windFolder.addBinding(this.envConfig, 'windEnabled', { label: 'Enable' });
  windFolder.addBinding(this.envConfig, 'windSpeed', { min: 0, max: 2, label: 'Speed' });
  windFolder.addBinding(this.envConfig, 'windDirection', { min: 0, max: 360, label: 'Direction' });
  windFolder.addBinding(this.envConfig, 'windTurbulence', { min: 0, max: 1, label: 'Turbulence' });
  
  // Predator sub-folder
  const predatorFolder = folder.addFolder({ title: 'Predator' });
  predatorFolder.addBinding(this.envConfig, 'predatorEnabled', { label: 'Enable' })
    .on('change', (ev) => this.onPredatorToggle?.(ev.value, this.envConfig.predatorType));
  predatorFolder.addBlade({
    view: 'list',
    label: 'Type',
    options: [
      { text: 'Hawk', value: 'hawk' },
      { text: 'Falcon', value: 'falcon' },
      { text: 'Eagle', value: 'eagle' },
      { text: 'Owl', value: 'owl' },
      { text: 'Shark', value: 'shark' },
      { text: 'Orca', value: 'orca' },
      { text: 'Barracuda', value: 'barracuda' },
      { text: 'Sea Lion', value: 'sea-lion' }
    ],
    value: this.envConfig.predatorType
  }).on('change', (ev) => {
    this.envConfig.predatorType = ev.value;
    this.onPredatorToggle?.(this.envConfig.predatorEnabled, ev.value);
  });
  
  // Food sub-folder
  const foodFolder = folder.addFolder({ title: 'Food' });
  foodFolder.addBinding(this.envConfig, 'foodEnabled', { label: 'Enable' })
    .on('change', (ev) => this.onFoodToggle?.(ev.value));
  foodFolder.addBinding(this.envConfig, 'foodCount', { min: 1, max: 10, step: 1, label: 'Count' });
  foodFolder.addBinding(this.envConfig, 'foodRadius', { min: 30, max: 200, label: 'Radius' });
  foodFolder.addBinding(this.envConfig, 'foodRespawnTime', { min: 1, max: 30, label: 'Respawn' });
  
  // Mating sub-folder
  const matingFolder = folder.addFolder({ title: 'Mating' });
  matingFolder.addBinding(this.envConfig, 'matingEnabled', { label: 'Enable' });
  matingFolder.addBinding(this.envConfig, 'mateSearchRadius', { min: 20, max: 200, label: 'Search' });
  matingFolder.addBinding(this.envConfig, 'matingDuration', { min: 0.5, max: 10, label: 'Duration' });
  matingFolder.addBinding(this.envConfig, 'matingCooldown', { min: 1, max: 30, label: 'Cooldown' });
}
```

### Preset Management UI

```typescript
private createPresetsFolder(): void {
  const folder = this.pane.addFolder({ title: 'Custom Presets', expanded: false });
  
  // Save current
  this.presetNameInput = folder.addBinding({ name: '' }, 'name', { label: 'Name' });
  folder.addButton({ title: 'Save Current' }).on('click', () => {
    const name = (this.presetNameInput as any).value;
    if (name) {
      this.presetManager.savePreset(name, this.simConfig);
      this.refreshPresetList();
    }
  });
  
  // Custom preset selector
  this.customPresetBlade = folder.addBlade({
    view: 'list',
    label: 'Load',
    options: this.getCustomPresetOptions(),
    value: ''
  }).on('change', (ev) => {
    if (ev.value) {
      this.loadCustomPreset(ev.value);
    }
  });
  
  // Delete
  folder.addButton({ title: 'Delete Selected' }).on('click', () => {
    const selected = (this.customPresetBlade as any).value;
    if (selected) {
      this.presetManager.deletePreset(selected);
      this.refreshPresetList();
    }
  });
  
  // Export/Import
  folder.addButton({ title: 'Export All' }).on('click', () => {
    const json = this.presetManager.exportPresets();
    this.downloadJson(json, 'swarm-presets.json');
  });
  
  folder.addButton({ title: 'Import' }).on('click', () => {
    this.openFileDialog((json) => {
      if (this.presetManager.importPresets(json)) {
        this.refreshPresetList();
      }
    });
  });
}
```

---

## Runtime Configuration Sync

### In App.ts

```typescript
private syncConfigs(): void {
  // Sync UI values to simulation
  if (this.flock) {
    this.flock.setConfig(this.simConfig);
    this.flock.setEnvironmentConfig(this.envConfig);
  }
  
  // Sync to renderers
  if (this.flockRenderer) {
    this.flockRenderer.setConfig(this.renderConfig);
  }
  
  // Sync to environment renderer
  if (this.envRenderer) {
    this.envRenderer.setConfig(this.renderConfig);
  }
}

// Called in game loop
private gameLoop(time: number): void {
  // ...
  this.syncConfigs();
  // ...
}
```

---

## Configuration Validation

```typescript
function validateSimConfig(config: Partial<ISimulationConfig>): ISimulationConfig {
  const defaults = getDefaultConfig().simulation;
  
  return {
    birdCount: clamp(config.birdCount ?? defaults.birdCount, 10, 50000),
    maxSpeed: clamp(config.maxSpeed ?? defaults.maxSpeed, 0.1, 100),
    maxForce: clamp(config.maxForce ?? defaults.maxForce, 0.01, 10),
    perceptionRadius: clamp(config.perceptionRadius ?? defaults.perceptionRadius, 1, 500),
    separationRadius: clamp(config.separationRadius ?? defaults.separationRadius, 1, 200),
    alignmentWeight: clamp(config.alignmentWeight ?? defaults.alignmentWeight, 0, 10),
    cohesionWeight: clamp(config.cohesionWeight ?? defaults.cohesionWeight, 0, 10),
    separationWeight: clamp(config.separationWeight ?? defaults.separationWeight, 0, 10),
    fieldOfView: clamp(config.fieldOfView ?? defaults.fieldOfView, 10, 360),
    boundaryMargin: clamp(config.boundaryMargin ?? defaults.boundaryMargin, 10, 500),
    boundaryForce: clamp(config.boundaryForce ?? defaults.boundaryForce, 0.01, 5),
    simulationSpeed: clamp(config.simulationSpeed ?? defaults.simulationSpeed, 0.01, 10),
    particleSize: clamp(config.particleSize ?? defaults.particleSize, 0.1, 5),
    noiseStrength: clamp(config.noiseStrength ?? defaults.noiseStrength, 0, 1),
    wanderStrength: clamp(config.wanderStrength ?? defaults.wanderStrength, 0, 1),
    energyEnabled: config.energyEnabled ?? defaults.energyEnabled,
    energyDecayRate: clamp(config.energyDecayRate ?? defaults.energyDecayRate, 0, 1),
    minEnergySpeed: clamp(config.minEnergySpeed ?? defaults.minEnergySpeed, 0, 1),
    foodEnergyRestore: clamp(config.foodEnergyRestore ?? defaults.foodEnergyRestore, 0, 2)
  };
}
```
