/**
 * Configuration Loader
 * Version: 2.0.0 - Complete color processing and default config
 */
import type { ILoadedConfig, ISimulationConfig, IEnvironmentConfig, IRenderingConfig } from '../types';

// Module-level state
let loadedConfig: ILoadedConfig | null = null;

/**
 * Convert hex color string to number.
 */
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

/**
 * Process raw JSON config, converting color strings to numbers.
 */
function processConfig(raw: Record<string, unknown>): ILoadedConfig {
  const config = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;

  // Process rendering colors
  if (config.rendering && typeof config.rendering === 'object') {
    const rendering = config.rendering as Record<string, unknown>;
    const colorFields = [
      'backgroundColor',
      'particleColor',
      'lowDensityColor',
      'highDensityColor',
      'slowColor',
      'fastColor',
      'calmColor',
      'panicColor',
      'maleColor',
      'femaleColor',
      'trailColor',
      'fireflyDimColor',
      'fireflyGlowColor'
    ];

    for (const field of colorFields) {
      if (rendering[field] !== undefined) {
        rendering[field] = convertColorValue(rendering[field] as string | number);
      }
    }
  }

  // Process predator preset colors
  if (config.predatorPresets && typeof config.predatorPresets === 'object') {
    const presets = config.predatorPresets as Record<string, Record<string, unknown>>;
    for (const key of Object.keys(presets)) {
      if (presets[key].color !== undefined) {
        presets[key].color = convertColorValue(presets[key].color as string | number);
      }
    }
  }

  // Process creature preset colors (birdColor field)
  if (config.creaturePresets && typeof config.creaturePresets === 'object') {
    const presets = config.creaturePresets as Record<string, Record<string, unknown>>;
    for (const key of Object.keys(presets)) {
      if (presets[key].birdColor !== undefined) {
        presets[key].birdColor = convertColorValue(presets[key].birdColor as string | number);
      }

      // Process creature preset rendering override colors (if present)
      const presetRendering = presets[key].rendering;
      if (presetRendering && typeof presetRendering === 'object') {
        const rendering = presetRendering as Record<string, unknown>;
        const colorFields = [
          'backgroundColor',
          'particleColor',
          'lowDensityColor',
          'highDensityColor',
          'fireflyDimColor',
          'fireflyGlowColor'
        ];
        for (const field of colorFields) {
          if (rendering[field] !== undefined) {
            rendering[field] = convertColorValue(rendering[field] as string | number);
          }
        }
      }
    }
  }

  return config as unknown as ILoadedConfig;
}

/**
 * Get default configuration.
 * Version: 2.0.0 - Complete configuration with all fields from interfaces
 */
export function getDefaultConfig(): ILoadedConfig {
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
      boundaryMargin: 150,
      boundaryForce: 1.5,
      boundaryCurvePower: 1.5,
      boundaryLookAhead: 0.8,
      wallDampingFactor: 0.8,
      minEscapeSpeed: 0.3,
      simulationSpeed: 1.0,
      noiseStrength: 0.05,
      wanderStrength: 0.1,
      energyEnabled: false,
      energyDecayRate: 0.02,
      minEnergySpeed: 0.3,
      foodEnergyRestore: 0.3
    },
    environment: {
      // Wind settings
      windEnabled: false,
      windSpeed: 0.1,
      windDirection: 0,
      windTurbulence: 0.5,
      // Predator settings
      predatorEnabled: false,
      predatorType: 'hawk',
      predatorCount: 1,
      panicRadius: 150,
      panicDecay: 0.05,
      panicSpread: 0.5,
      // Food settings
      foodEnabled: false,
      foodCount: 3,
      foodRadius: 100,
      foodRespawnTime: 10,
      foodAttractionRadius: 200,
      maxFeedersPerFood: 10,
      gatherRadius: 50,
      feedingDuration: 2.0,
      // Mating settings
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
      femaleSelectivity: 0.3,
      // Firefly settings
      fireflyEnabled: false,
      fireflyBaseFrequency: 1.0,
      fireflyFrequencyVariation: 0.2,
      fireflyCouplingStrength: 0.5,
      fireflySyncRadius: 100,
      fireflyFlashDuration: 0.3,
      // Day/Night cycle
      dayNight: {
        enabled: false,
        cycleDuration: 120,
        timeOfDay: 0.5,
        freezeTime: false
      },
      // Territories
      territories: {
        enabled: false,
        showZones: true,
        defaultRadius: 150,
        pullStrength: 0.5
      },
      // Multi-species ecosystem
      ecosystem: {
        enabled: false,
        speciesCount: 2,
        interactionRange: 100,
        huntingForce: 1.0,
        fleeingForce: 1.5
      }
    },
    rendering: {
      backgroundColor: 0x0a0a0f,
      particleColor: 0x00ff88,
      particleSize: 1.0,
      particleShape: 'arrow',
      antialias: true,
      colorMode: 'density',
      lowDensityColor: 0x00aaff,
      highDensityColor: 0xff4466,
      slowColor: 0x4444ff,
      fastColor: 0xffff44,
      calmColor: 0x44ff44,
      panicColor: 0xff4444,
      maleColor: 0x4488ff,
      femaleColor: 0xff88aa,
      trailEnabled: false,
      trailLength: 20,
      trailColor: 0x00ff88,
      glowEnabled: false,
      glowIntensity: 0.5,
      // Firefly glow colors
      fireflyDimColor: 0x3d2814,
      fireflyGlowColor: 0xf7dc6f,
      // Visual effects toggles
      motionBlurEnabled: false,
      showWindParticles: false,
      showPredatorRange: true,
      showFoodSources: true,
      showTerritories: true
    },
    creaturePresets: {
      starlings: {
        name: 'Starlings',
        birdCount: 2000,
        maxSpeed: 15,
        maxForce: 0.5,
        perceptionRadius: 50,
        separationRadius: 25,
        alignmentWeight: 1.0,
        cohesionWeight: 1.0,
        separationWeight: 1.5,
        fieldOfView: 270,
        particleSize: 1.0
      },
      insects: {
        name: 'Insect Swarm',
        birdCount: 3000,
        maxSpeed: 25,
        maxForce: 1.2,
        perceptionRadius: 30,
        separationRadius: 15,
        alignmentWeight: 0.5,
        cohesionWeight: 1.5,
        separationWeight: 2.0,
        fieldOfView: 360,
        particleSize: 0.5
      },
      fish: {
        name: 'Fish School',
        birdCount: 1500,
        maxSpeed: 10,
        maxForce: 0.3,
        perceptionRadius: 60,
        separationRadius: 20,
        alignmentWeight: 1.5,
        cohesionWeight: 1.2,
        separationWeight: 1.0,
        fieldOfView: 300,
        particleSize: 1.2
      }
    },
    predatorPresets: {
      hawk: {
        name: 'Hawk',
        maxSpeed: 18,
        panicRadius: 120,
        huntingStyle: 'edge',
        color: 0xcc6600
      },
      falcon: {
        name: 'Falcon',
        maxSpeed: 25,
        panicRadius: 180,
        huntingStyle: 'stoop',
        color: 0x8844aa
      }
    }
  };
}

/**
 * Load configuration from URL.
 */
export async function loadConfig(url: string = '/config.json'): Promise<ILoadedConfig> {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.warn(`Failed to load config from ${url}, using defaults`);
      return getDefaultConfig();
    }

    const json = await response.json();
    return processConfig(json);
  } catch (error) {
    console.warn('Error loading config:', error);
    return getDefaultConfig();
  }
}

/**
 * Set the global configuration.
 */
export function setConfig(config: ILoadedConfig): void {
  loadedConfig = config;
}

/**
 * Get the current global configuration.
 */
export function getConfig(): ILoadedConfig {
  if (!loadedConfig) {
    console.warn('Config not loaded, returning defaults');
    return getDefaultConfig();
  }
  return loadedConfig;
}

/**
 * Create a deep copy of simulation config.
 */
export function cloneSimulationConfig(config: ISimulationConfig): ISimulationConfig {
  return { ...config };
}

/**
 * Create a deep copy of environment config.
 */
export function cloneEnvironmentConfig(config: IEnvironmentConfig): IEnvironmentConfig {
  return { ...config };
}

/**
 * Create a deep copy of rendering config.
 */
export function cloneRenderingConfig(config: IRenderingConfig): IRenderingConfig {
  return { ...config };
}


