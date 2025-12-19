import { Pane } from 'tweakpane';
import type {
  ISimulationConfig,
  IEnvironmentConfig,
  IRenderingConfig,
  ICreaturePreset,
  PredatorType,
  PresetChangeCallback,
  BirdCountChangeCallback,
  PredatorToggleCallback,
  FoodToggleCallback,
  ConfigChangeCallback,
  PerceptionRadiusChangeCallback,
  TrailsToggleCallback,
  DayNightToggleCallback,
  TerritoryToggleCallback,
  EcosystemToggleCallback,
  PauseResumeCallback,
  ResetCallback,
  PredatorTypeChangeCallback,
  PredatorCountChangeCallback
} from '../types';
import { getPresetManager } from '../config/PresetManager';

// Tweakpane v4 types - using any for flexible API compatibility
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TweakpaneAny = any;

/**
 * Tweakpane control panel for simulation parameters.
 * Version: 6.3.0 - Added emojis to all settings folders
 */
export class ControlPanel {
  private pane: TweakpaneAny;
  private simConfig: ISimulationConfig;
  private envConfig: IEnvironmentConfig;
  private renderConfig: IRenderingConfig;

  // Callbacks
  private onPresetChange: PresetChangeCallback | null = null;
  private onBirdCountChange: BirdCountChangeCallback | null = null;
  private onPredatorToggle: PredatorToggleCallback | null = null;
  private onPredatorTypeChange: PredatorTypeChangeCallback | null = null;
  private onPredatorCountChange: PredatorCountChangeCallback | null = null;
  private onFoodToggle: FoodToggleCallback | null = null;
  private onConfigChange: ConfigChangeCallback | null = null;
  private onPauseResume: PauseResumeCallback | null = null;
  private onReset: ResetCallback | null = null;
  private onPerceptionRadiusChange: PerceptionRadiusChangeCallback | null = null;
  private onTrailsToggle: TrailsToggleCallback | null = null;
  private onDayNightToggle: DayNightToggleCallback | null = null;
  private onTerritoryToggle: TerritoryToggleCallback | null = null;
  private onEcosystemToggle: EcosystemToggleCallback | null = null;

  // Presets
  private creaturePresets: Record<string, ICreaturePreset>;
  private selectedPreset: string = 'starlings';

  // State
  private isPaused: boolean = false;
  private pauseButton: TweakpaneAny = null;

  constructor(
    simConfig: ISimulationConfig,
    envConfig: IEnvironmentConfig,
    renderConfig: IRenderingConfig,
    creaturePresets: Record<string, ICreaturePreset>
  ) {
    this.simConfig = simConfig;
    this.envConfig = envConfig;
    this.renderConfig = renderConfig;
    this.creaturePresets = creaturePresets;

    this.pane = new Pane({
      title: 'Swarm Controls',
      expanded: true
    }) as TweakpaneAny;

    this.buildUI();
  }

  /**
   * Build the control panel UI.
   */
  private buildUI(): void {
    // Presets folder
    this.buildPresetsFolder();

    // Custom Presets folder
    this.buildCustomPresetsFolder();

    // Simulation folder
    this.buildSimulationFolder();

    // Environment folder (Wind, Predator, Food)
    this.buildEnvironmentFolder();

    // Feature folders (root level)
    this.buildEnergySystemFolder();
    this.buildMatingFolder();
    this.buildFireflyFolder();
    this.buildDayNightFolder();
    this.buildTerritoriesFolder();
    this.buildEcosystemFolder();

    // Rendering folder
    this.buildRenderingFolder();
  }

  /**
   * Build presets folder.
   */
  private buildPresetsFolder(): void {
    const folder = this.pane.addFolder({
      title: '🎭 Presets',
      expanded: true
    });

    // Preset selector
    const presetOptions = Object.entries(this.creaturePresets).reduce(
      (acc, [key, preset]) => {
        acc[preset.name] = key;
        return acc;
      },
      {} as Record<string, string>
    );

    const presetBinding = { preset: this.selectedPreset };

    folder.addBinding(presetBinding, 'preset', {
      options: presetOptions,
      label: 'Creature'
    }).on('change', (ev: TweakpaneAny) => {
      this.selectedPreset = ev.value;
      this.applyPreset(ev.value);
      this.onPresetChange?.(ev.value);
    });

    // Bird count (quick access)
    folder.addBinding(this.simConfig, 'birdCount', {
      min: 100,
      max: 20000,
      step: 100,
      label: 'Population'
    }).on('change', (ev: TweakpaneAny) => {
      this.onBirdCountChange?.(ev.value);
    });

    // Simulation speed
    folder.addBinding(this.simConfig, 'simulationSpeed', {
      min: 0.1,
      max: 3.0,
      step: 0.1,
      label: 'Speed'
    });
  }

  /**
   * Build custom presets folder with save/load/export/import.
   */
  private buildCustomPresetsFolder(): void {
    const folder = this.pane.addFolder({
      title: '💾 Custom Presets',
      expanded: false
    });

    const presetManager = getPresetManager();
    
    // State for UI bindings
    const presetState = {
      selectedCustomPreset: '',
      newPresetName: ''
    };

    // Custom preset selector
    const updatePresetOptions = (): Record<string, string> => {
      const presets = presetManager.listPresets();
      const options: Record<string, string> = { '-- Select --': '' };
      presets.forEach(name => { options[name] = name; });
      return options;
    };

    let customPresetDropdown = folder.addBinding(presetState, 'selectedCustomPreset', {
      options: updatePresetOptions(),
      label: 'Saved'
    });

    // Load selected preset button
    folder.addButton({
      title: '📂 Load Selected'
    }).on('click', () => {
      if (!presetState.selectedCustomPreset) {
        console.warn('No preset selected');
        return;
      }
      const preset = presetManager.loadPreset(presetState.selectedCustomPreset);
      if (preset) {
        this.applyPresetValues(preset);
        // Ensure population is updated immediately (same as built-in preset change behavior)
        this.onBirdCountChange?.(this.simConfig.birdCount);
        console.log('Loaded preset:', presetState.selectedCustomPreset);
      }
    });

    // Delete selected preset button
    folder.addButton({
      title: '🗑️ Delete Selected'
    }).on('click', () => {
      if (!presetState.selectedCustomPreset) {
        console.warn('No preset selected');
        return;
      }
      if (confirm(`Delete preset "${presetState.selectedCustomPreset}"?`)) {
        presetManager.deletePreset(presetState.selectedCustomPreset);
        presetState.selectedCustomPreset = '';
        // Refresh dropdown
        customPresetDropdown.dispose();
        customPresetDropdown = folder.addBinding(presetState, 'selectedCustomPreset', {
          options: updatePresetOptions(),
          label: 'Saved'
        });
        console.log('Preset deleted');
      }
    });

    folder.addBlade({ view: 'separator' });

    // New preset name input
    folder.addBinding(presetState, 'newPresetName', {
      label: 'Name'
    });

    // Save current as new preset button
    folder.addButton({
      title: '💾 Save Current'
    }).on('click', () => {
      const name = presetState.newPresetName.trim();
      if (!name) {
        console.warn('Enter a preset name first');
        return;
      }
      if (presetManager.hasPreset(name)) {
        if (!confirm(`Preset "${name}" exists. Overwrite?`)) return;
      }
      presetManager.savePreset(name, this.simConfig, this.envConfig, this.renderConfig);
      presetState.newPresetName = '';
      // Refresh dropdown
      customPresetDropdown.dispose();
      customPresetDropdown = folder.addBinding(presetState, 'selectedCustomPreset', {
        options: updatePresetOptions(),
        label: 'Saved'
      });
      console.log('Saved preset:', name);
    });

    folder.addBlade({ view: 'separator' });

    // Export all presets
    folder.addButton({
      title: '📤 Export All'
    }).on('click', () => {
      const json = presetManager.exportPresets();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'swarm-presets.json';
      a.click();
      URL.revokeObjectURL(url);
      console.log('Presets exported');
    });

    // Import presets
    folder.addButton({
      title: '📥 Import'
    }).on('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const text = await file.text();
        const success = presetManager.importPresets(text);
        if (success) {
          // Refresh dropdown
          customPresetDropdown.dispose();
          customPresetDropdown = folder.addBinding(presetState, 'selectedCustomPreset', {
            options: updatePresetOptions(),
            label: 'Saved'
          });
          console.log('Presets imported');
        } else {
          console.error('Failed to import presets');
        }
      };
      input.click();
    });
  }

  /**
   * Build simulation parameters folder.
   */
  private buildSimulationFolder(): void {
    const folder = this.pane.addFolder({
      title: '🎮 Simulation',
      expanded: false
    });

    // Control buttons
    const controls = folder.addFolder({ title: 'Controls', expanded: true });

    this.pauseButton = controls.addButton({
      title: 'Pause'
    }).on('click', () => {
      this.isPaused = !this.isPaused;
      this.pauseButton.title = this.isPaused ? 'Resume' : 'Pause';
      this.onPauseResume?.(this.isPaused);
    });

    controls.addButton({
      title: 'Reset'
    }).on('click', () => {
      this.onReset?.();
    });

    // Movement
    const movement = folder.addFolder({ title: 'Movement', expanded: true });

    movement.addBinding(this.simConfig, 'maxSpeed', {
      min: 1,
      max: 50,
      step: 1
    }).on('change', () => {
      this.onConfigChange?.();
    });

    movement.addBinding(this.simConfig, 'maxForce', {
      min: 0.1,
      max: 2.0,
      step: 0.1
    }).on('change', () => {
      this.onConfigChange?.();
    });

    // Flocking weights
    const flocking = folder.addFolder({ title: 'Flocking', expanded: true });

    flocking.addBinding(this.simConfig, 'perceptionRadius', {
      min: 10,
      max: 200,
      step: 5
    }).on('change', (ev: TweakpaneAny) => {
      this.onPerceptionRadiusChange?.(ev.value);
      this.onConfigChange?.();
    });

    flocking.addBinding(this.simConfig, 'separationRadius', {
      min: 5,
      max: 100,
      step: 5
    }).on('change', () => {
      this.onConfigChange?.();
    });

    flocking.addBinding(this.simConfig, 'alignmentWeight', {
      min: 0,
      max: 3,
      step: 0.1
    }).on('change', () => {
      this.onConfigChange?.();
    });

    flocking.addBinding(this.simConfig, 'cohesionWeight', {
      min: 0,
      max: 3,
      step: 0.1
    }).on('change', () => {
      this.onConfigChange?.();
    });

    flocking.addBinding(this.simConfig, 'separationWeight', {
      min: 0,
      max: 3,
      step: 0.1
    }).on('change', () => {
      this.onConfigChange?.();
    });

    flocking.addBinding(this.simConfig, 'fieldOfView', {
      min: 90,
      max: 360,
      step: 10,
      label: 'FOV (deg)'
    }).on('change', () => {
      this.onConfigChange?.();
    });

    // Boundary
    const boundary = folder.addFolder({ title: 'Boundary', expanded: false });

    boundary.addBinding(this.simConfig, 'boundaryMargin', {
      min: 20,
      max: 300,
      step: 10
    }).on('change', () => {
      this.onConfigChange?.();
    });

    boundary.addBinding(this.simConfig, 'boundaryForce', {
      min: 0.1,
      max: 2.0,
      step: 0.1
    }).on('change', () => {
      this.onConfigChange?.();
    });

    // Noise/Wander
    const noise = folder.addFolder({ title: 'Noise', expanded: false });

    noise.addBinding(this.simConfig, 'noiseStrength', {
      min: 0,
      max: 0.5,
      step: 0.01
    }).on('change', () => {
      this.onConfigChange?.();
    });

    noise.addBinding(this.simConfig, 'wanderStrength', {
      min: 0,
      max: 0.5,
      step: 0.01
    }).on('change', () => {
      this.onConfigChange?.();
    });
  }

  /**
   * Build environment folder.
   */
  private buildEnvironmentFolder(): void {
    const folder = this.pane.addFolder({
      title: '🌍 Environment',
      expanded: false
    });

    // Wind
    const wind = folder.addFolder({ title: '💨 Wind', expanded: true });

    wind.addBinding(this.envConfig, 'windEnabled').on('change', () => {
      this.onConfigChange?.();
    });

    wind.addBinding(this.envConfig, 'windSpeed', {
      min: 0,
      max: 2,
      step: 0.1
    }).on('change', () => {
      this.onConfigChange?.();
    });

    wind.addBinding(this.envConfig, 'windDirection', {
      min: 0,
      max: 360,
      step: 5,
      label: 'Direction (deg)'
    }).on('change', () => {
      this.onConfigChange?.();
    });

    wind.addBinding(this.envConfig, 'windTurbulence', {
      min: 0,
      max: 1,
      step: 0.1
    }).on('change', () => {
      this.onConfigChange?.();
    });

    // Predator
    const predator = folder.addFolder({ title: '🦅 Predator', expanded: true });

    predator.addBinding(this.envConfig, 'predatorEnabled', {
      label: 'Enabled'
    }).on('change', (ev: TweakpaneAny) => {
      this.onPredatorToggle?.(ev.value, this.envConfig.predatorType);
    });

    const predatorTypes: Record<string, PredatorType> = {
      'Hawk': 'hawk',
      'Falcon': 'falcon',
      'Eagle': 'eagle',
      'Owl': 'owl',
      'Shark': 'shark',
      'Orca': 'orca'
    };

    predator.addBinding(this.envConfig, 'predatorType', {
      options: predatorTypes,
      label: 'Type'
    }).on('change', (ev: TweakpaneAny) => {
      this.onPredatorTypeChange?.(ev.value);
      if (this.envConfig.predatorEnabled) {
        this.onPredatorToggle?.(true, this.envConfig.predatorType);
      }
    });

    predator.addBinding(this.envConfig, 'predatorCount', {
      min: 1,
      max: 5,
      step: 1,
      label: 'Count'
    }).on('change', (ev: TweakpaneAny) => {
      this.onPredatorCountChange?.(ev.value);
      if (this.envConfig.predatorEnabled) {
        this.onPredatorToggle?.(true, this.envConfig.predatorType);
      }
    });

    predator.addBinding(this.envConfig, 'panicRadius', {
      min: 50,
      max: 300,
      step: 10
    }).on('change', () => {
      this.onConfigChange?.();
    });

    predator.addBinding(this.envConfig, 'panicDecay', {
      min: 0.01,
      max: 0.2,
      step: 0.01
    }).on('change', () => {
      this.onConfigChange?.();
    });

    // Food
    const food = folder.addFolder({ title: '🍎 Food', expanded: true });

    food.addBinding(this.envConfig, 'foodEnabled', {
      label: 'Enabled'
    }).on('change', (ev: TweakpaneAny) => {
      this.onFoodToggle?.(ev.value);
      this.onConfigChange?.();
    });

    food.addBinding(this.envConfig, 'foodCount', {
      min: 1,
      max: 10,
      step: 1
    }).on('change', () => {
      this.onConfigChange?.();
    });

    food.addBinding(this.envConfig, 'foodRadius', {
      min: 30,
      max: 200,
      step: 10
    }).on('change', () => {
      this.onConfigChange?.();
    });

    food.addBinding(this.envConfig, 'foodRespawnTime', {
      min: 5,
      max: 30,
      step: 1,
      label: 'Respawn (s)'
    }).on('change', () => {
      this.onConfigChange?.();
    });
  }

  /**
   * Build Energy System folder (root level).
   */
  private buildEnergySystemFolder(): void {
    const folder = this.pane.addFolder({ title: '⚡ Energy System', expanded: false });

    folder.addBinding(this.simConfig, 'energyEnabled', {
      label: 'Enabled'
    }).on('change', () => {
      this.onConfigChange?.();
    });

    folder.addBinding(this.simConfig, 'energyDecayRate', {
      min: 0.001,
      max: 0.1,
      step: 0.001,
      label: 'Decay Rate'
    }).on('change', () => {
      this.onConfigChange?.();
    });

    folder.addBinding(this.simConfig, 'minEnergySpeed', {
      min: 0.1,
      max: 1.0,
      step: 0.05,
      label: 'Min Speed %'
    }).on('change', () => {
      this.onConfigChange?.();
    });

    folder.addBinding(this.simConfig, 'foodEnergyRestore', {
      min: 0.1,
      max: 1.0,
      step: 0.05,
      label: 'Food Restore'
    }).on('change', () => {
      this.onConfigChange?.();
    });
  }

  /**
   * Build Mating & Competition folder (root level).
   */
  private buildMatingFolder(): void {
    const folder = this.pane.addFolder({ title: '💕 Mating & Competition', expanded: false });

    folder.addBinding(this.envConfig, 'matingEnabled', {
      label: 'Enabled'
    }).on('change', () => {
      this.onConfigChange?.();
    });

    folder.addBinding(this.envConfig, 'mateSearchRadius', {
      min: 50,
      max: 300,
      step: 10,
      label: 'Search Radius'
    }).on('change', () => {
      this.onConfigChange?.();
    });

    folder.addBinding(this.envConfig, 'mateAttractionStrength', {
      min: 0.1,
      max: 2.0,
      step: 0.1,
      label: 'Attraction'
    }).on('change', () => {
      this.onConfigChange?.();
    });

    folder.addBinding(this.envConfig, 'matingDuration', {
      min: 1,
      max: 10,
      step: 0.5,
      label: 'Duration (s)'
    }).on('change', () => {
      this.onConfigChange?.();
    });

    folder.addBinding(this.envConfig, 'matingCooldown', {
      min: 5,
      max: 60,
      step: 5,
      label: 'Cooldown (s)'
    }).on('change', () => {
      this.onConfigChange?.();
    });

    folder.addBinding(this.envConfig, 'fightRadius', {
      min: 20,
      max: 100,
      step: 5,
      label: 'Fight Range'
    }).on('change', () => {
      this.onConfigChange?.();
    });

    folder.addBinding(this.envConfig, 'fightStrength', {
      min: 0.1,
      max: 1.0,
      step: 0.1,
      label: 'Fight Intensity'
    }).on('change', () => {
      this.onConfigChange?.();
    });

    folder.addBinding(this.envConfig, 'femaleSelectivity', {
      min: 0,
      max: 1,
      step: 0.1,
      label: 'Female Pickiness'
    }).on('change', () => {
      this.onConfigChange?.();
    });
  }

  /**
   * Build Firefly Glow folder (root level).
   */
  private buildFireflyFolder(): void {
    const folder = this.pane.addFolder({ title: '🔥 Firefly Glow', expanded: false });

    folder.addBinding(this.envConfig, 'fireflyEnabled', {
      label: 'Enabled'
    }).on('change', (ev: TweakpaneAny) => {
      // When firefly is enabled, automatically set colorMode to 'firefly'
      // for the best visual effect
      if (ev.value) {
        this.renderConfig.colorMode = 'firefly';
      }
      this.onConfigChange?.();
      // Refresh the pane to update colorMode dropdown
      this.pane?.refresh();
    });

    folder.addBinding(this.envConfig, 'fireflyBaseFrequency', {
      min: 0.2,
      max: 3.0,
      step: 0.1,
      label: 'Flash Frequency'
    }).on('change', () => {
      this.onConfigChange?.();
    });

    folder.addBinding(this.envConfig, 'fireflyFrequencyVariation', {
      min: 0,
      max: 0.5,
      step: 0.05,
      label: 'Freq Variation'
    }).on('change', () => {
      this.onConfigChange?.();
    });

    folder.addBinding(this.envConfig, 'fireflyCouplingStrength', {
      min: 0,
      max: 2.0,
      step: 0.1,
      label: 'Sync Strength'
    }).on('change', () => {
      this.onConfigChange?.();
    });

    folder.addBinding(this.envConfig, 'fireflySyncRadius', {
      min: 20,
      max: 200,
      step: 10,
      label: 'Sync Radius'
    }).on('change', () => {
      this.onConfigChange?.();
    });

    folder.addBinding(this.envConfig, 'fireflyFlashDuration', {
      min: 0.1,
      max: 0.6,
      step: 0.05,
      label: 'Flash Duration'
    }).on('change', () => {
      this.onConfigChange?.();
    });
  }

  /**
   * Build Day/Night Cycle folder (root level).
   */
  private buildDayNightFolder(): void {
    const folder = this.pane.addFolder({ title: '🌙 Day/Night Cycle', expanded: false });

    // Ensure dayNight config exists with defaults
    if (!this.envConfig.dayNight) {
      this.envConfig.dayNight = {
        enabled: false,
        cycleDuration: 120,
        timeOfDay: 0.5,
        freezeTime: false
      };
    }

    folder.addBinding(this.envConfig.dayNight, 'enabled', {
      label: 'Enabled'
    }).on('change', (ev: TweakpaneAny) => {
      this.onDayNightToggle?.(ev.value);
      this.onConfigChange?.();
    });

    folder.addBinding(this.envConfig.dayNight, 'cycleDuration', {
      min: 30,
      max: 600,
      step: 10,
      label: 'Cycle (s)'
    }).on('change', () => {
      this.onConfigChange?.();
    });

    folder.addBinding(this.envConfig.dayNight, 'timeOfDay', {
      min: 0,
      max: 1,
      step: 0.01,
      label: 'Time of Day'
    }).on('change', () => {
      this.onConfigChange?.();
    });

    folder.addBinding(this.envConfig.dayNight, 'freezeTime', {
      label: 'Freeze Time'
    }).on('change', () => {
      this.onConfigChange?.();
    });

    // Quick buttons
    folder.addButton({
      title: '☀️ Skip to Day'
    }).on('click', () => {
      this.envConfig.dayNight.timeOfDay = 0.5;
      this.pane.refresh?.();
      this.onConfigChange?.();
    });

    folder.addButton({
      title: '🌙 Skip to Night'
    }).on('click', () => {
      this.envConfig.dayNight.timeOfDay = 0;
      this.pane.refresh?.();
      this.onConfigChange?.();
    });
  }

  /**
   * Build Territories folder (root level).
   */
  private buildTerritoriesFolder(): void {
    const folder = this.pane.addFolder({ title: '🏠 Territories', expanded: false });

    // Ensure territories config exists with defaults
    if (!this.envConfig.territories) {
      this.envConfig.territories = {
        enabled: false,
        showZones: true,
        defaultRadius: 150,
        pullStrength: 0.5
      };
    }

    folder.addBinding(this.envConfig.territories, 'enabled', {
      label: 'Enabled'
    }).on('change', (ev: TweakpaneAny) => {
      this.onTerritoryToggle?.(ev.value);
      this.onConfigChange?.();
    });

    folder.addBinding(this.envConfig.territories, 'showZones', {
      label: 'Show Zones'
    }).on('change', () => {
      this.onConfigChange?.();
    });

    folder.addBinding(this.envConfig.territories, 'defaultRadius', {
      min: 50,
      max: 400,
      step: 10,
      label: 'Radius'
    }).on('change', () => {
      this.onConfigChange?.();
    });

    folder.addBinding(this.envConfig.territories, 'pullStrength', {
      min: 0,
      max: 2,
      step: 0.1,
      label: 'Pull Force'
    }).on('change', () => {
      this.onConfigChange?.();
    });
  }

  /**
   * Build Multi-Species Ecosystem folder (root level).
   */
  private buildEcosystemFolder(): void {
    const folder = this.pane.addFolder({ title: '🦋 Multi-Species', expanded: false });

    // Ensure ecosystem config exists with defaults
    if (!this.envConfig.ecosystem) {
      this.envConfig.ecosystem = {
        enabled: false,
        speciesCount: 2,
        interactionRange: 100,
        huntingForce: 1.0,
        fleeingForce: 1.5
      };
    }

    folder.addBinding(this.envConfig.ecosystem, 'enabled', {
      label: 'Enabled'
    }).on('change', (ev: TweakpaneAny) => {
      this.onEcosystemToggle?.(ev.value);
      this.onConfigChange?.();
    });

    folder.addBinding(this.envConfig.ecosystem, 'speciesCount', {
      min: 2,
      max: 5,
      step: 1,
      label: 'Species'
    }).on('change', () => {
      this.onConfigChange?.();
    });

    folder.addBinding(this.envConfig.ecosystem, 'interactionRange', {
      min: 50,
      max: 300,
      step: 10,
      label: 'Interact Range'
    }).on('change', () => {
      this.onConfigChange?.();
    });

    folder.addBinding(this.envConfig.ecosystem, 'huntingForce', {
      min: 0,
      max: 3,
      step: 0.1,
      label: 'Hunt Force'
    }).on('change', () => {
      this.onConfigChange?.();
    });

    folder.addBinding(this.envConfig.ecosystem, 'fleeingForce', {
      min: 0,
      max: 3,
      step: 0.1,
      label: 'Flee Force'
    }).on('change', () => {
      this.onConfigChange?.();
    });
  }

  /**
   * Build rendering folder.
   */
  private buildRenderingFolder(): void {
    const folder = this.pane.addFolder({
      title: '🎨 Rendering',
      expanded: false
    });

    // Particle
    const particle = folder.addFolder({ title: 'Particles', expanded: true });

    particle.addBinding(this.renderConfig, 'particleSize', {
      min: 0.2,
      max: 3,
      step: 0.1
    }).on('change', () => {
      this.onConfigChange?.();
    });

    const shapes: Record<string, string> = {
      'Arrow': 'arrow',
      'Triangle': 'triangle',
      'Circle': 'circle',
      'Dot': 'dot'
    };

    particle.addBinding(this.renderConfig, 'particleShape', {
      options: shapes,
      label: 'Shape'
    }).on('change', () => {
      this.onConfigChange?.();
    });

    // Color mode
    const colors = folder.addFolder({ title: 'Colors', expanded: true });

    // Background color with hex input
    const bgColorObj = { value: this.numToHex(this.renderConfig.backgroundColor) };
    colors.addBinding(bgColorObj, 'value', {
      label: 'Background',
      view: 'color'
    }).on('change', (ev: TweakpaneAny) => {
      this.renderConfig.backgroundColor = this.hexToNum(ev.value);
      this.onConfigChange?.();
    });

    // Bird color with hex input  
    const birdColorObj = { value: this.numToHex(this.renderConfig.particleColor) };
    colors.addBinding(birdColorObj, 'value', {
      label: 'Bird Color',
      view: 'color'
    }).on('change', (ev: TweakpaneAny) => {
      this.renderConfig.particleColor = this.hexToNum(ev.value);
      this.onConfigChange?.();
    });

    // Dense color picker (high density)
    const denseColorObj = { value: this.numToHex(this.renderConfig.highDensityColor ?? 0xf1948a) };
    colors.addBinding(denseColorObj, 'value', {
      label: 'Dense Color',
      view: 'color'
    }).on('change', (ev: TweakpaneAny) => {
      this.renderConfig.highDensityColor = this.hexToNum(ev.value);
      this.onConfigChange?.();
    });

    // Panic color picker
    const panicColorObj = { value: this.numToHex(this.renderConfig.panicColor ?? 0xf5b7b1) };
    colors.addBinding(panicColorObj, 'value', {
      label: 'Panic Color',
      view: 'color'
    }).on('change', (ev: TweakpaneAny) => {
      this.renderConfig.panicColor = this.hexToNum(ev.value);
      this.onConfigChange?.();
    });

    const colorModes: Record<string, string> = {
      'Solid': 'solid',
      'Density': 'density',
      'Speed': 'speed',
      'Panic': 'panic',
      'Gender': 'gender',
      'Mating': 'mating',
      'Firefly': 'firefly'
    };

    colors.addBinding(this.renderConfig, 'colorMode', {
      options: colorModes,
      label: 'Mode'
    }).on('change', () => {
      this.onConfigChange?.();
    });

    // Trails
    const trails = folder.addFolder({ title: 'Trails', expanded: false });

    trails.addBinding(this.renderConfig, 'trailEnabled', {
      label: 'Enabled'
    }).on('change', (ev: TweakpaneAny) => {
      this.onTrailsToggle?.(ev.value);
    });

    trails.addBinding(this.renderConfig, 'trailLength', {
      min: 5,
      max: 50,
      step: 1
    }).on('change', () => {
      this.onConfigChange?.();
    });

    // Glow Effects
    const glow = folder.addFolder({ title: '✨ Glow', expanded: false });

    glow.addBinding(this.renderConfig, 'glowEnabled', {
      label: 'Enabled'
    }).on('change', () => {
      this.onConfigChange?.();
    });

    glow.addBinding(this.renderConfig, 'glowIntensity', {
      min: 0.1,
      max: 2.0,
      step: 0.1,
      label: 'Intensity'
    }).on('change', () => {
      this.onConfigChange?.();
    });

    // Firefly glow colors
    const fireflyDimColorObj = { value: this.numToHex(this.renderConfig.fireflyDimColor ?? 0x3d2814) };
    glow.addBinding(fireflyDimColorObj, 'value', {
      label: 'Dim Color',
      view: 'color'
    }).on('change', (ev: TweakpaneAny) => {
      this.renderConfig.fireflyDimColor = this.hexToNum(ev.value);
      this.onConfigChange?.();
    });

    const fireflyGlowColorObj = { value: this.numToHex(this.renderConfig.fireflyGlowColor ?? 0xf7dc6f) };
    glow.addBinding(fireflyGlowColorObj, 'value', {
      label: 'Glow Color',
      view: 'color'
    }).on('change', (ev: TweakpaneAny) => {
      this.renderConfig.fireflyGlowColor = this.hexToNum(ev.value);
      this.onConfigChange?.();
    });

    // Visual Effects
    this.buildEffectsFolder(folder);
  }

  /**
   * Build Visual Effects folder.
   */
  private buildEffectsFolder(parent: TweakpaneAny): void {
    const folder = parent.addFolder({ title: '🎬 Effects', expanded: false });

    // Ensure effect properties exist with defaults
    if (this.renderConfig.motionBlurEnabled === undefined) {
      this.renderConfig.motionBlurEnabled = false;
    }
    if (this.renderConfig.showWindParticles === undefined) {
      this.renderConfig.showWindParticles = false;
    }
    if (this.renderConfig.showPredatorRange === undefined) {
      this.renderConfig.showPredatorRange = true;
    }
    if (this.renderConfig.showFoodSources === undefined) {
      this.renderConfig.showFoodSources = true;
    }
    if (this.renderConfig.showTerritories === undefined) {
      this.renderConfig.showTerritories = true;
    }

    folder.addBinding(this.renderConfig, 'motionBlurEnabled', {
      label: 'Motion Blur'
    }).on('change', () => {
      this.onConfigChange?.();
    });

    folder.addBinding(this.renderConfig, 'showWindParticles', {
      label: 'Wind Particles'
    }).on('change', () => {
      this.onConfigChange?.();
    });

    folder.addBinding(this.renderConfig, 'showPredatorRange', {
      label: 'Predator Range'
    }).on('change', () => {
      this.onConfigChange?.();
    });

    folder.addBinding(this.renderConfig, 'showFoodSources', {
      label: 'Food Sources'
    }).on('change', () => {
      this.onConfigChange?.();
    });

    folder.addBinding(this.renderConfig, 'showTerritories', {
      label: 'Territories'
    }).on('change', () => {
      this.onConfigChange?.();
    });
  }

  /**
   * Convert number color to hex string for tweakpane.
   */
  private numToHex(num: number): string {
    return '#' + num.toString(16).padStart(6, '0');
  }

  /**
   * Convert hex string to number.
   */
  private hexToNum(hex: string): number {
    return parseInt(hex.replace('#', ''), 16);
  }

  /**
   * Apply a creature preset.
   */
  private applyPreset(presetKey: string): void {
    const preset = this.creaturePresets[presetKey];
    if (!preset) return;

    this.applyPresetValues(preset);
  }

  /**
   * Apply preset values (supports both built-in and custom presets).
   */
  private applyPresetValues(preset: ICreaturePreset): void {
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
    this.renderConfig.particleSize = preset.particleSize;

    // Apply bird color if preset has one
    if (preset.birdColor !== undefined) {
      this.renderConfig.particleColor = preset.birdColor;
      // Also update low density color to match for solid color mode
      this.renderConfig.lowDensityColor = preset.birdColor;
    }

    // Apply environment overrides
    if (preset.environment) {
      const env = preset.environment;
      if (env.windEnabled !== undefined) this.envConfig.windEnabled = env.windEnabled;
      if (env.windSpeed !== undefined) this.envConfig.windSpeed = env.windSpeed;
      if (env.windDirection !== undefined) this.envConfig.windDirection = env.windDirection;
      if (env.windTurbulence !== undefined) this.envConfig.windTurbulence = env.windTurbulence;

      if (env.fireflyEnabled !== undefined) this.envConfig.fireflyEnabled = env.fireflyEnabled;
      if (env.fireflyBaseFrequency !== undefined) this.envConfig.fireflyBaseFrequency = env.fireflyBaseFrequency;
      if (env.fireflyFrequencyVariation !== undefined) this.envConfig.fireflyFrequencyVariation = env.fireflyFrequencyVariation;
      if (env.fireflyCouplingStrength !== undefined) this.envConfig.fireflyCouplingStrength = env.fireflyCouplingStrength;
      if (env.fireflySyncRadius !== undefined) this.envConfig.fireflySyncRadius = env.fireflySyncRadius;
      if (env.fireflyFlashDuration !== undefined) this.envConfig.fireflyFlashDuration = env.fireflyFlashDuration;

      if (env.dayNight !== undefined) this.envConfig.dayNight = env.dayNight;
    }

    // Apply rendering overrides
    if (preset.rendering) {
      const r = preset.rendering;
      if (r.backgroundColor !== undefined) this.renderConfig.backgroundColor = r.backgroundColor;
      if (r.particleColor !== undefined) this.renderConfig.particleColor = r.particleColor;
      if (r.lowDensityColor !== undefined) this.renderConfig.lowDensityColor = r.lowDensityColor;
      if (r.highDensityColor !== undefined) this.renderConfig.highDensityColor = r.highDensityColor;

      if (r.particleShape !== undefined) this.renderConfig.particleShape = r.particleShape;
      if (r.colorMode !== undefined) this.renderConfig.colorMode = r.colorMode;
      if (r.glowEnabled !== undefined) this.renderConfig.glowEnabled = r.glowEnabled;
      if (r.glowIntensity !== undefined) this.renderConfig.glowIntensity = r.glowIntensity;

      if (r.fireflyDimColor !== undefined) this.renderConfig.fireflyDimColor = r.fireflyDimColor;
      if (r.fireflyGlowColor !== undefined) this.renderConfig.fireflyGlowColor = r.fireflyGlowColor;
    } else if (preset.environment?.fireflyEnabled) {
      // Keep previous UX behavior: enabling fireflies implies firefly color mode
      this.renderConfig.colorMode = 'firefly';
    }

    // Refresh pane to show updated values (v4 auto-updates, but call if available)
    this.pane.refresh?.();

    this.onConfigChange?.();
  }

  /**
   * Set callbacks.
   */
  setCallbacks(callbacks: {
    onPresetChange?: PresetChangeCallback;
    onBirdCountChange?: BirdCountChangeCallback;
    onPredatorToggle?: PredatorToggleCallback;
    onPredatorTypeChange?: PredatorTypeChangeCallback;
    onPredatorCountChange?: PredatorCountChangeCallback;
    onFoodToggle?: FoodToggleCallback;
    onConfigChange?: ConfigChangeCallback;
    onPauseResume?: PauseResumeCallback;
    onReset?: ResetCallback;
    onPerceptionRadiusChange?: PerceptionRadiusChangeCallback;
    onTrailsToggle?: TrailsToggleCallback;
    onDayNightToggle?: DayNightToggleCallback;
    onTerritoryToggle?: TerritoryToggleCallback;
    onEcosystemToggle?: EcosystemToggleCallback;
  }): void {
    this.onPresetChange = callbacks.onPresetChange || null;
    this.onBirdCountChange = callbacks.onBirdCountChange || null;
    this.onPredatorToggle = callbacks.onPredatorToggle || null;
    this.onPredatorTypeChange = callbacks.onPredatorTypeChange || null;
    this.onPredatorCountChange = callbacks.onPredatorCountChange || null;
    this.onFoodToggle = callbacks.onFoodToggle || null;
    this.onConfigChange = callbacks.onConfigChange || null;
    this.onPauseResume = callbacks.onPauseResume || null;
    this.onReset = callbacks.onReset || null;
    this.onPerceptionRadiusChange = callbacks.onPerceptionRadiusChange || null;
    this.onTrailsToggle = callbacks.onTrailsToggle || null;
    this.onDayNightToggle = callbacks.onDayNightToggle || null;
    this.onTerritoryToggle = callbacks.onTerritoryToggle || null;
    this.onEcosystemToggle = callbacks.onEcosystemToggle || null;
  }

  /**
   * Get current configs.
   */
  getConfigs(): {
    simulation: ISimulationConfig;
    environment: IEnvironmentConfig;
    rendering: IRenderingConfig;
  } {
    return {
      simulation: this.simConfig,
      environment: this.envConfig,
      rendering: this.renderConfig
    };
  }

  /**
   * Refresh pane values.
   */
  refresh(): void {
    this.pane.refresh?.();
  }

  /**
   * Destroy pane.
   */
  destroy(): void {
    this.pane.dispose();
  }
}

