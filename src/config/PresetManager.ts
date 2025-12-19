import type { ICreaturePreset, IEnvironmentConfig, IRenderingConfig, ISimulationConfig } from '../types';

const STORAGE_KEY = 'swarm-simulator-custom-presets';

/**
 * Manages custom preset storage in localStorage.
 */
export class PresetManager {
  private customPresets: Map<string, ICreaturePreset>;

  constructor() {
    this.customPresets = this.loadFromStorage();
  }

  /**
   * Save a preset from current configs.
   */
  savePreset(
    name: string,
    simConfig: ISimulationConfig,
    envConfig?: IEnvironmentConfig,
    renderConfig?: IRenderingConfig
  ): void {
    const preset: ICreaturePreset = {
      name,
      birdCount: simConfig.birdCount,
      maxSpeed: simConfig.maxSpeed,
      maxForce: simConfig.maxForce,
      perceptionRadius: simConfig.perceptionRadius,
      separationRadius: simConfig.separationRadius,
      alignmentWeight: simConfig.alignmentWeight,
      cohesionWeight: simConfig.cohesionWeight,
      separationWeight: simConfig.separationWeight,
      fieldOfView: simConfig.fieldOfView,
      particleSize: simConfig.particleSize,
      ...(envConfig
        ? {
            environment: {
              windEnabled: envConfig.windEnabled,
              windSpeed: envConfig.windSpeed,
              windDirection: envConfig.windDirection,
              windTurbulence: envConfig.windTurbulence,
              fireflyEnabled: envConfig.fireflyEnabled,
              fireflyBaseFrequency: envConfig.fireflyBaseFrequency,
              fireflyFrequencyVariation: envConfig.fireflyFrequencyVariation,
              fireflyCouplingStrength: envConfig.fireflyCouplingStrength,
              fireflySyncRadius: envConfig.fireflySyncRadius,
              fireflyFlashDuration: envConfig.fireflyFlashDuration,
              dayNight: envConfig.dayNight
            }
          }
        : {}),
      ...(renderConfig
        ? {
            rendering: {
              backgroundColor: renderConfig.backgroundColor,
              particleColor: renderConfig.particleColor,
              lowDensityColor: renderConfig.lowDensityColor,
              highDensityColor: renderConfig.highDensityColor,
              particleShape: renderConfig.particleShape,
              colorMode: renderConfig.colorMode,
              glowEnabled: renderConfig.glowEnabled,
              glowIntensity: renderConfig.glowIntensity,
              fireflyDimColor: renderConfig.fireflyDimColor,
              fireflyGlowColor: renderConfig.fireflyGlowColor
            }
          }
        : {})
    };

    this.customPresets.set(name, preset);
    this.saveToStorage();
  }

  /**
   * Load a preset by name.
   */
  loadPreset(name: string): ICreaturePreset | null {
    return this.customPresets.get(name) || null;
  }

  /**
   * Delete a preset by name.
   */
  deletePreset(name: string): boolean {
    const deleted = this.customPresets.delete(name);
    if (deleted) {
      this.saveToStorage();
    }
    return deleted;
  }

  /**
   * List all custom preset names.
   */
  listPresets(): string[] {
    return Array.from(this.customPresets.keys());
  }

  /**
   * Get all custom presets as a record.
   */
  getAllPresets(): Record<string, ICreaturePreset> {
    return Object.fromEntries(this.customPresets);
  }

  /**
   * Export all presets as JSON string.
   */
  exportPresets(): string {
    const obj = Object.fromEntries(this.customPresets);
    return JSON.stringify(obj, null, 2);
  }

  /**
   * Import presets from JSON string.
   */
  importPresets(json: string): boolean {
    try {
      const parsed = JSON.parse(json) as Record<string, unknown>;

      // Validate structure
      for (const [key, preset] of Object.entries(parsed)) {
        if (!this.isValidPreset(preset)) {
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

  /**
   * Check if preset has been modified from default.
   */
  hasPreset(name: string): boolean {
    return this.customPresets.has(name);
  }

  /**
   * Clear all custom presets.
   */
  clearAll(): void {
    this.customPresets.clear();
    this.saveToStorage();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private loadFromStorage(): Map<string, ICreaturePreset> {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return new Map();

      const parsed = JSON.parse(stored) as Record<string, ICreaturePreset>;
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

  private isValidPreset(obj: unknown): obj is ICreaturePreset {
    if (typeof obj !== 'object' || obj === null) return false;
    const p = obj as Record<string, unknown>;

    const baseValid =
      typeof p.name === 'string' &&
      typeof p.birdCount === 'number' &&
      typeof p.maxSpeed === 'number' &&
      typeof p.maxForce === 'number' &&
      typeof p.perceptionRadius === 'number' &&
      typeof p.separationRadius === 'number' &&
      typeof p.alignmentWeight === 'number' &&
      typeof p.cohesionWeight === 'number' &&
      typeof p.separationWeight === 'number' &&
      typeof p.fieldOfView === 'number' &&
      typeof p.particleSize === 'number';

    if (!baseValid) return false;

    // Optional nested overrides
    if (p.rendering !== undefined) {
      if (typeof p.rendering !== 'object' || p.rendering === null) return false;
      const r = p.rendering as Record<string, unknown>;

      if (r.backgroundColor !== undefined && typeof r.backgroundColor !== 'number') return false;
      if (r.particleColor !== undefined && typeof r.particleColor !== 'number') return false;
      if (r.lowDensityColor !== undefined && typeof r.lowDensityColor !== 'number') return false;
      if (r.highDensityColor !== undefined && typeof r.highDensityColor !== 'number') return false;

      if (
        r.particleShape !== undefined &&
        r.particleShape !== 'arrow' &&
        r.particleShape !== 'circle' &&
        r.particleShape !== 'triangle' &&
        r.particleShape !== 'dot'
      ) return false;

      if (
        r.colorMode !== undefined &&
        r.colorMode !== 'solid' &&
        r.colorMode !== 'density' &&
        r.colorMode !== 'speed' &&
        r.colorMode !== 'panic' &&
        r.colorMode !== 'gender' &&
        r.colorMode !== 'mating' &&
        r.colorMode !== 'firefly'
      ) return false;

      if (r.glowEnabled !== undefined && typeof r.glowEnabled !== 'boolean') return false;
      if (r.glowIntensity !== undefined && typeof r.glowIntensity !== 'number') return false;

      if (r.fireflyDimColor !== undefined && typeof r.fireflyDimColor !== 'number') return false;
      if (r.fireflyGlowColor !== undefined && typeof r.fireflyGlowColor !== 'number') return false;
    }

    if (p.environment !== undefined) {
      if (typeof p.environment !== 'object' || p.environment === null) return false;
      const e = p.environment as Record<string, unknown>;

      if (e.windEnabled !== undefined && typeof e.windEnabled !== 'boolean') return false;
      if (e.windSpeed !== undefined && typeof e.windSpeed !== 'number') return false;
      if (e.windDirection !== undefined && typeof e.windDirection !== 'number') return false;
      if (e.windTurbulence !== undefined && typeof e.windTurbulence !== 'number') return false;

      if (e.fireflyEnabled !== undefined && typeof e.fireflyEnabled !== 'boolean') return false;
      if (e.fireflyBaseFrequency !== undefined && typeof e.fireflyBaseFrequency !== 'number') return false;
      if (e.fireflyFrequencyVariation !== undefined && typeof e.fireflyFrequencyVariation !== 'number') return false;
      if (e.fireflyCouplingStrength !== undefined && typeof e.fireflyCouplingStrength !== 'number') return false;
      if (e.fireflySyncRadius !== undefined && typeof e.fireflySyncRadius !== 'number') return false;
      if (e.fireflyFlashDuration !== undefined && typeof e.fireflyFlashDuration !== 'number') return false;

      if (e.dayNight !== undefined) {
        if (typeof e.dayNight !== 'object' || e.dayNight === null) return false;
        const dn = e.dayNight as Record<string, unknown>;
        if (typeof dn.enabled !== 'boolean') return false;
        if (typeof dn.cycleDuration !== 'number') return false;
        if (typeof dn.timeOfDay !== 'number') return false;
        if (typeof dn.freezeTime !== 'boolean') return false;
      }
    }

    return true;
  }
}

// Singleton instance
let presetManagerInstance: PresetManager | null = null;

export function getPresetManager(): PresetManager {
  if (!presetManagerInstance) {
    presetManagerInstance = new PresetManager();
  }
  return presetManagerInstance;
}


