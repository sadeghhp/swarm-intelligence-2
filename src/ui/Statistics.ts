import type { ISimulationStats, PredatorBehaviorState } from '../types';

// FPS color thresholds
const FPS_GOOD = 55;
const FPS_WARNING = 30;

// Predator state colors
const PREDATOR_STATE_COLORS: Record<PredatorBehaviorState, string> = {
  idle: 'var(--text-muted, #888)',
  scanning: '#ffaa00',
  stalking: '#ffaa00',
  hunting: '#ffaa00',
  attacking: '#ff6666',
  diving: '#ff6666',
  ambushing: '#9b59b6',
  ascending: '#00aaff',
  circling: '#ff9900',
  herding: '#44aa44',
  recovering: '#888888'
};

/**
 * Updates the statistics display in the DOM.
 * Version: 3.0.0 - Added gender count, social status, time of day display
 */
export class Statistics {
  private fpsElement: HTMLElement | null;
  private birdCountElement: HTMLElement | null;
  private avgDensityElement: HTMLElement | null;
  private avgSpeedElement: HTMLElement | null;
  private simTimeElement: HTMLElement | null;
  private gpuStatusElement: HTMLElement | null;
  private predatorElement: HTMLElement | null;
  private foodElement: HTMLElement | null;
  private energyElement: HTMLElement | null;
  private genderCountElement: HTMLElement | null;
  private socialStatusElement: HTMLElement | null;
  private timeOfDayElement: HTMLElement | null;

  // FPS calculation
  private frameCount: number = 0;
  private lastFpsUpdate: number = 0;
  private currentFps: number = 0;

  // Simulation time
  private simulationTime: number = 0;

  constructor() {
    this.fpsElement = document.getElementById('fps');
    this.birdCountElement = document.getElementById('bird-count');
    this.avgDensityElement = document.getElementById('avg-density');
    this.avgSpeedElement = document.getElementById('avg-speed');
    this.simTimeElement = document.getElementById('sim-time');
    this.gpuStatusElement = document.getElementById('gpu-status');
    this.predatorElement = document.getElementById('predator-status');
    this.foodElement = document.getElementById('food-status');
    this.energyElement = document.getElementById('energy-status');
    this.genderCountElement = document.getElementById('gender-count');
    this.socialStatusElement = document.getElementById('social-status');
    this.timeOfDayElement = document.getElementById('time-of-day');
  }

  /**
   * Update FPS counter with color coding.
   */
  updateFps(deltaTime: number): void {
    this.frameCount++;
    this.lastFpsUpdate += deltaTime;

    if (this.lastFpsUpdate >= 1.0) {
      this.currentFps = this.frameCount;
      this.frameCount = 0;
      this.lastFpsUpdate = 0;

      if (this.fpsElement) {
        this.fpsElement.textContent = this.currentFps.toString();
        
        // Color coding: green (55+), yellow (30-54), red (<30)
        if (this.currentFps >= FPS_GOOD) {
          this.fpsElement.style.color = 'var(--accent-cyan, #00d4ff)';
        } else if (this.currentFps >= FPS_WARNING) {
          this.fpsElement.style.color = '#ffaa00';
        } else {
          this.fpsElement.style.color = '#ff6666';
        }
      }
    }
  }

  /**
   * Update simulation statistics.
   */
  update(stats: ISimulationStats, deltaTime: number): void {
    this.simulationTime += deltaTime;

    if (this.birdCountElement) {
      this.birdCountElement.textContent = stats.birdCount.toLocaleString();
    }

    if (this.avgDensityElement) {
      this.avgDensityElement.textContent = stats.avgDensity.toFixed(2);
    }

    if (this.avgSpeedElement) {
      this.avgSpeedElement.textContent = stats.avgVelocity.toFixed(1);
    }

    if (this.simTimeElement) {
      this.simTimeElement.textContent = this.formatTime(this.simulationTime);
    }

    // Update predator status
    this.updatePredatorStatus(stats);

    // Update food status
    this.updateFoodStatus(stats);

    // Update energy status
    this.updateEnergyStatus(stats);

    // Update gender count
    this.updateGenderCount(stats);

    // Update social status (mating/fighting)
    this.updateSocialStatus(stats);

    // Update time of day
    this.updateTimeOfDay(stats);
  }

  /**
   * Update predator status display.
   */
  updatePredatorStatus(stats: ISimulationStats): void {
    if (!this.predatorElement) return;

    if (stats.predatorState && stats.activePredators && stats.activePredators > 0) {
      const state = stats.predatorState;
      const color = PREDATOR_STATE_COLORS[state] || 'var(--text-muted, #888)';
      const stateText = this.capitalizeFirst(state);
      const typeText = stats.predatorType ? this.capitalizeFirst(stats.predatorType) : 'Predator';
      const countText = stats.activePredators > 1 ? ` (${stats.activePredators})` : '';
      
      this.predatorElement.innerHTML = `
        <span style="color: ${color}; font-weight: 500;">🦅 ${typeText}${countText}: ${stateText}</span>
      `;
    } else {
      this.predatorElement.innerHTML = `
        <span style="color: var(--text-muted, #888);">No Predator</span>
      `;
    }
  }

  /**
   * Update food status display.
   */
  updateFoodStatus(stats: ISimulationStats): void {
    if (!this.foodElement) return;

    const foodCount = stats.activeFoodSources ?? 0;
    const feedingBirds = stats.feedingBirds ?? 0;

    if (foodCount > 0) {
      this.foodElement.innerHTML = `
        <span style="color: #88ff88;">🍃 ${foodCount} food</span>
        ${feedingBirds > 0 ? `<span style="color: #aaffaa; font-size: 10px;"> (${feedingBirds} feeding)</span>` : ''}
      `;
    } else {
      this.foodElement.innerHTML = `
        <span style="color: var(--text-muted, #888);">No Food</span>
      `;
    }
  }

  /**
   * Update energy status display.
   */
  updateEnergyStatus(stats: ISimulationStats): void {
    if (!this.energyElement) return;

    const avgEnergy = stats.avgEnergy ?? 1;
    const percentage = Math.round(avgEnergy * 100);
    
    // Color based on energy level
    let color = '#88ff88'; // High
    if (avgEnergy < 0.3) {
      color = '#ff6666'; // Critical
    } else if (avgEnergy < 0.6) {
      color = '#ffaa00'; // Low
    }

    this.energyElement.innerHTML = `
      <span style="color: ${color};">⚡ ${percentage}%</span>
    `;
  }

  /**
   * Update GPU status indicator.
   */
  updateGpuStatus(isActive: boolean, info?: string): void {
    if (!this.gpuStatusElement) return;

    this.gpuStatusElement.className = isActive ? 'gpu-active' : 'gpu-inactive';
    
    if (isActive) {
      // WebGPU is active
      const displayInfo = info || 'Active';
      this.gpuStatusElement.innerHTML = `
        <span style="font-weight: 600;">⚡ WebGPU</span>
        <span style="opacity: 0.7; font-size: 10px;">${displayInfo}</span>
      `;
    } else {
      // Canvas2D fallback
      const displayInfo = info || 'CPU Mode';
      this.gpuStatusElement.innerHTML = `
        <span style="font-weight: 600;">🖥️ ${displayInfo}</span>
        <span style="opacity: 0.7; font-size: 10px;">Fallback</span>
      `;
    }
  }

  /**
   * Format time as mm:ss.
   */
  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Capitalize first letter of string.
   */
  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Update gender count display.
   */
  updateGenderCount(stats: ISimulationStats): void {
    if (!this.genderCountElement) return;

    const maleCount = stats.maleCount ?? 0;
    const femaleCount = stats.femaleCount ?? 0;

    if (maleCount > 0 || femaleCount > 0) {
      this.genderCountElement.innerHTML = `
        <span style="color: #5dade2;">♂ ${maleCount}</span>
        <span style="color: #888;"> / </span>
        <span style="color: #f5b7b1;">♀ ${femaleCount}</span>
      `;
    } else {
      this.genderCountElement.innerHTML = `
        <span style="color: var(--text-muted, #888);">N/A</span>
      `;
    }
  }

  /**
   * Update social status (mating pairs and fights).
   */
  updateSocialStatus(stats: ISimulationStats): void {
    if (!this.socialStatusElement) return;

    const matingPairs = stats.activeMatingPairs ?? stats.matingPairs ?? 0;
    const fights = stats.activeFights ?? stats.fightingPairs ?? 0;

    const matingColor = matingPairs > 0 ? '#f5b7b1' : 'var(--text-muted, #888)';
    const fightColor = fights > 0 ? '#ff6666' : 'var(--text-muted, #888)';

    this.socialStatusElement.innerHTML = `
      <span style="color: ${matingColor};">💕 ${matingPairs}</span>
      <span style="color: #888;"> / </span>
      <span style="color: ${fightColor};">⚔ ${fights}</span>
    `;
  }

  /**
   * Update time of day display.
   */
  updateTimeOfDay(stats: ISimulationStats): void {
    if (!this.timeOfDayElement) return;

    const timeOfDay = stats.timeOfDay;
    
    if (timeOfDay === undefined) {
      this.timeOfDayElement.innerHTML = `
        <span style="color: var(--text-muted, #888);">--</span>
      `;
      return;
    }

    // timeOfDay: 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset, 1 = midnight
    let icon: string;
    let label: string;
    let color: string;

    if (timeOfDay < 0.2 || timeOfDay > 0.8) {
      // Night (midnight area)
      icon = '🌙';
      label = 'Night';
      color = '#6c7a89';
    } else if (timeOfDay < 0.3) {
      // Dawn
      icon = '🌅';
      label = 'Dawn';
      color = '#f5b041';
    } else if (timeOfDay < 0.7) {
      // Day
      icon = '☀️';
      label = 'Day';
      color = '#f7dc6f';
    } else {
      // Dusk
      icon = '🌇';
      label = 'Dusk';
      color = '#e67e22';
    }

    this.timeOfDayElement.innerHTML = `
      <span style="color: ${color};">${icon} ${label}</span>
    `;
  }

  /**
   * Get current FPS.
   */
  getFps(): number {
    return this.currentFps;
  }

  /**
   * Reset simulation time.
   */
  resetTime(): void {
    this.simulationTime = 0;
  }
}

