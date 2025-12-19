import { fbm, degToRad } from '../utils/MathUtils';
import type { IEnvironmentConfig } from '../types';

/**
 * Wind system with turbulence.
 */
export class Wind {
  private baseDirection: number = 0;
  private baseSpeed: number = 0;
  private turbulence: number = 0;
  private time: number = 0;
  private enabled: boolean = true;

  constructor(config: IEnvironmentConfig) {
    this.updateConfig(config);
  }

  /**
   * Update wind configuration.
   */
  updateConfig(config: IEnvironmentConfig): void {
    this.enabled = config.windEnabled;
    this.baseSpeed = config.windSpeed;
    this.baseDirection = degToRad(config.windDirection);
    this.turbulence = config.windTurbulence;
  }

  /**
   * Update wind (advance time for turbulence).
   */
  update(dt: number): void {
    this.time += dt;
  }

  /**
   * Get wind force at a position.
   * Includes base wind + turbulence noise.
   */
  getForceAt(x: number, y: number): { x: number; y: number } {
    if (!this.enabled) {
      return { x: 0, y: 0 };
    }

    // Base wind direction
    let windX = Math.cos(this.baseDirection) * this.baseSpeed;
    let windY = Math.sin(this.baseDirection) * this.baseSpeed;

    // Add turbulence using noise
    if (this.turbulence > 0) {
      const noiseScale = 0.005;
      const timeScale = 0.2;

      // Angle variation from noise
      const angleNoise = fbm(
        x * noiseScale + this.time * timeScale,
        y * noiseScale,
        3
      ) * Math.PI * this.turbulence;

      // Speed variation from noise
      const speedNoise = fbm(
        x * noiseScale + 1000,
        y * noiseScale + this.time * timeScale,
        3
      ) * this.turbulence;

      // Apply turbulence
      const turbulentAngle = this.baseDirection + angleNoise;
      const turbulentSpeed = this.baseSpeed * (1 + speedNoise);

      windX = Math.cos(turbulentAngle) * turbulentSpeed;
      windY = Math.sin(turbulentAngle) * turbulentSpeed;
    }

    return { x: windX, y: windY };
  }

  /**
   * Get uniform wind force (no position-based turbulence).
   */
  getUniformForce(): { x: number; y: number } {
    if (!this.enabled) {
      return { x: 0, y: 0 };
    }

    return {
      x: Math.cos(this.baseDirection) * this.baseSpeed,
      y: Math.sin(this.baseDirection) * this.baseSpeed
    };
  }

  /**
   * Get current wind direction in degrees.
   */
  getDirection(): number {
    return this.baseDirection * (180 / Math.PI);
  }

  /**
   * Get current wind speed.
   */
  getSpeed(): number {
    return this.baseSpeed;
  }

  /**
   * Check if wind is enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

