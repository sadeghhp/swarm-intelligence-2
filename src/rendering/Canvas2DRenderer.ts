/**
 * Canvas2D Fallback Renderer
 * Version: 2.0.0 - Added firefly glow support
 * 
 * Provides CPU-based rendering when WebGPU is not available.
 * Uses standard Canvas 2D API for compatibility with all browsers.
 */

import type { IRenderingConfig, IAttractor, IFoodSource } from '../types';
import type { BirdArrays } from '../simulation/Bird';
import type { BasePredator } from '../environment';
import { lerpColor, clamp } from '../utils/MathUtils';

// Version: 2.0.0

/**
 * Fallback renderer using Canvas 2D API.
 * Works on all browsers without WebGPU support.
 */
export class Canvas2DRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private config: IRenderingConfig;
  private maxBirds: number;

  // Trail data
  private trailEnabled: boolean = false;
  private trailLength: number = 10;
  private trailColor: number = 0x4488ff;
  private trailHistory: Array<Float32Array> = [];
  private trailIndex: number = 0;

  // Time for animations
  private time: number = 0;

  constructor(canvas: HTMLCanvasElement, config: IRenderingConfig, maxBirds: number) {
    console.log('Canvas2DRenderer v2.0.0 - Initializing (firefly glow support)');
    this.canvas = canvas;
    this.config = config;
    this.maxBirds = maxBirds;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D canvas context');
    }
    this.ctx = ctx;

    // Initialize trail history
    this.trailEnabled = config.trailEnabled;
    this.trailLength = config.trailLength;
    this.trailColor = config.trailColor;
    this.initTrailHistory();

    console.log('Canvas2DRenderer initialized');
  }

  private initTrailHistory(): void {
    this.trailHistory = [];
    for (let i = 0; i < this.trailLength; i++) {
      this.trailHistory.push(new Float32Array(this.maxBirds * 2));
    }
  }

  updateConfig(config: IRenderingConfig): void {
    this.config = config;
    this.trailEnabled = config.trailEnabled;
    
    if (config.trailLength !== this.trailLength) {
      this.trailLength = config.trailLength;
      this.trailColor = config.trailColor;
      this.initTrailHistory();
      this.trailIndex = 0;
    }
  }

  /**
   * Update trail positions.
   */
  updateTrails(birdArrays: BirdArrays): void {
    if (!this.trailEnabled) return;

    const count = birdArrays.count;
    const positions = this.trailHistory[this.trailIndex];
    
    for (let i = 0; i < count; i++) {
      positions[i * 2] = birdArrays.positionX[i];
      positions[i * 2 + 1] = birdArrays.positionY[i];
    }

    this.trailIndex = (this.trailIndex + 1) % this.trailLength;
  }

  /**
   * Main render function.
   */
  render(
    birdArrays: BirdArrays,
    screenWidth: number,
    screenHeight: number,
    attractors: IAttractor[] = [],
    foodSources: IFoodSource[] = [],
    predators: BasePredator[] = [],
    windEnabled: boolean = false,
    windDirection: number = 0,
    windSpeed: number = 0
  ): void {
    this.time += 0.016;
    const ctx = this.ctx;

    // Clear with background
    const bg = this.config.backgroundColor;
    const bgR = (bg >> 16) & 0xFF;
    const bgG = (bg >> 8) & 0xFF;
    const bgB = bg & 0xFF;
    ctx.fillStyle = `rgb(${bgR}, ${bgG}, ${bgB})`;
    ctx.fillRect(0, 0, screenWidth, screenHeight);

    // Render trails
    if (this.trailEnabled) {
      this.renderTrails(birdArrays.count);
    }

    // Render wind indicator
    if (windEnabled && windSpeed > 0) {
      this.renderWind(windDirection, windSpeed, screenWidth, screenHeight);
    }

    // Render food sources
    for (const food of foodSources) {
      this.renderFood(food);
    }

    // Render attractors
    for (const attractor of attractors) {
      this.renderAttractor(attractor);
    }

    // Render predators
    for (const predator of predators) {
      this.renderPredator(predator);
    }

    // Render birds
    this.renderBirds(birdArrays);
  }

  private renderTrails(count: number): void {
    const ctx = this.ctx;
    const baseR = (this.trailColor >> 16) & 0xFF;
    const baseG = (this.trailColor >> 8) & 0xFF;
    const baseB = this.trailColor & 0xFF;

    for (let t = 0; t < this.trailLength - 1; t++) {
      const idx1 = (this.trailIndex + t) % this.trailLength;
      const idx2 = (this.trailIndex + t + 1) % this.trailLength;
      const pos1 = this.trailHistory[idx1];
      const pos2 = this.trailHistory[idx2];

      const alpha = (t / this.trailLength) * 0.3;
      ctx.strokeStyle = `rgba(${baseR}, ${baseG}, ${baseB}, ${alpha})`;
      ctx.lineWidth = 1;

      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const x1 = pos1[i * 2];
        const y1 = pos1[i * 2 + 1];
        const x2 = pos2[i * 2];
        const y2 = pos2[i * 2 + 1];

        // Skip if positions are invalid or too far apart (wrap)
        if (x1 === 0 && y1 === 0) continue;
        const dx = Math.abs(x2 - x1);
        const dy = Math.abs(y2 - y1);
        if (dx > 100 || dy > 100) continue;

        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
      ctx.stroke();
    }
  }

  private renderBirds(birdArrays: BirdArrays): void {
    const ctx = this.ctx;
    const count = birdArrays.count;
    const baseSize = this.config.particleSize * 4;
    const isFireflyMode = this.config.colorMode === 'firefly';
    const glowEnabled = isFireflyMode || this.config.glowEnabled;

    for (let i = 0; i < count; i++) {
      const x = birdArrays.positionX[i];
      const y = birdArrays.positionY[i];
      const heading = birdArrays.heading[i];
      const density = birdArrays.localDensity[i];
      const glowIntensity = birdArrays.glowIntensity?.[i] ?? 0;

      // Scale size based on glow intensity for pulsing effect
      const glowScale = glowEnabled ? 1 + glowIntensity * 0.3 : 1;
      const size = baseSize * glowScale;

      // Pre-compute arrow shape
      const tipOffset = size;
      const wingOffset = size * 0.5;
      const wingSpread = size * 0.4;

      // Calculate color based on color mode
      let color = this.config.particleColor;
      
      switch (this.config.colorMode) {
        case 'solid':
          color = this.config.particleColor;
          break;
        case 'density':
          color = lerpColor(this.config.lowDensityColor, this.config.highDensityColor, clamp(density, 0, 1));
          break;
        case 'speed': {
          // Use velocity magnitude for speed coloring
          const vx = birdArrays.velocityX[i];
          const vy = birdArrays.velocityY[i];
          const speed = Math.sqrt(vx * vx + vy * vy) / 20; // Normalize
          color = lerpColor(this.config.slowColor, this.config.fastColor, clamp(speed, 0, 1));
          break;
        }
        case 'panic':
          color = lerpColor(this.config.calmColor, this.config.panicColor, clamp(birdArrays.panicLevel?.[i] ?? 0, 0, 1));
          break;
        case 'gender':
          color = birdArrays.gender?.[i] === 1 
            ? this.config.maleColor 
            : this.config.femaleColor;
          break;
        case 'mating': {
          const matingState = birdArrays.matingState?.[i] ?? 0;
          if (matingState > 0 && matingState < 5) {
            color = 0xff00ff;
          } else if (matingState === 5) {
            color = 0xff0000;
          } else {
            color = birdArrays.gender?.[i] === 1 
              ? this.config.maleColor 
              : this.config.femaleColor;
          }
          break;
        }
        case 'firefly': {
          // Firefly mode: lerp between dim and glow colors based on intensity
          const dimColor = this.config.fireflyDimColor ?? 0x3d2814;
          const glowColor = this.config.fireflyGlowColor ?? 0xf7dc6f;
          color = lerpColor(dimColor, glowColor, clamp(glowIntensity, 0, 1));
          break;
        }
        default:
          color = this.config.particleColor;
      }

      const r = (color >> 16) & 0xFF;
      const g = (color >> 8) & 0xFF;
      const b = color & 0xFF;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(heading);

      // Apply glow effect using canvas shadow
      if (glowEnabled && glowIntensity > 0.1) {
        const glowStrength = glowIntensity * (this.config.glowIntensity ?? 1.0);
        ctx.shadowColor = `rgb(${Math.min(255, r + 50)}, ${Math.min(255, g + 30)}, ${Math.min(255, b + 10)})`;
        ctx.shadowBlur = 8 + glowStrength * 15;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }

      // Draw arrow shape
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.beginPath();
      ctx.moveTo(tipOffset, 0);  // Tip
      ctx.lineTo(-wingOffset, wingSpread);   // Top wing
      ctx.lineTo(-wingOffset, -wingSpread);  // Bottom wing
      ctx.closePath();
      ctx.fill();

      // Draw additional glow halo for bright fireflies
      if (isFireflyMode && glowIntensity > 0.5) {
        ctx.shadowBlur = 0;
        const haloRadius = size * 1.5 * glowIntensity;
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, haloRadius);
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${glowIntensity * 0.4})`);
        gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${glowIntensity * 0.2})`);
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, haloRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  private renderAttractor(attractor: IAttractor): void {
    const ctx = this.ctx;
    const x = attractor.x;
    const y = attractor.y;
    const radius = attractor.radius;

    if (attractor.isRepulsor) {
      // Red for repulsor
      ctx.strokeStyle = 'rgba(255, 68, 68, 0.6)';
      ctx.fillStyle = 'rgba(255, 68, 68, 0.1)';
    } else {
      // Blue for attractor
      ctx.strokeStyle = 'rgba(68, 136, 255, 0.6)';
      ctx.fillStyle = 'rgba(68, 136, 255, 0.1)';
    }

    // Draw influence radius
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Draw center
    ctx.fillStyle = attractor.isRepulsor ? '#ff4444' : '#4488ff';
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  private renderFood(food: IFoodSource): void {
    const ctx = this.ctx;
    const x = food.position.x;
    const y = food.position.y;
    const radius = food.radius;

    // Green for food - alpha based on consumed state
    const alpha = !food.consumed ? 1 : 0.3;
    ctx.fillStyle = `rgba(68, 255, 68, ${alpha * 0.3})`;
    ctx.strokeStyle = `rgba(68, 255, 68, ${alpha})`;

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Draw center marker
    ctx.fillStyle = `rgba(68, 255, 68, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  private renderPredator(predator: BasePredator): void {
    const ctx = this.ctx;
    const x = predator.position.x;
    const y = predator.position.y;
    const heading = predator.heading;
    const size = 20;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(heading);

    // Red predator shape (larger triangle)
    ctx.fillStyle = '#ff2222';
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.7, size * 0.5);
    ctx.lineTo(-size * 0.7, -size * 0.5);
    ctx.closePath();
    ctx.fill();

    // Outline
    ctx.strokeStyle = '#ff6666';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();

    // Draw panic radius
    ctx.strokeStyle = 'rgba(255, 34, 34, 0.2)';
    ctx.beginPath();
    ctx.arc(x, y, predator.panicRadius, 0, Math.PI * 2);
    ctx.stroke();
  }

  private renderWind(direction: number, speed: number, _screenWidth: number, screenHeight: number): void {
    const ctx = this.ctx;
    const dirRad = direction * Math.PI / 180;

    // Draw wind indicator in corner
    const cx = 60;
    const cy = screenHeight - 60;
    const arrowLength = 30 * Math.min(speed / 5, 1);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(dirRad);

    // Wind arrow
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-arrowLength, 0);
    ctx.lineTo(arrowLength, 0);
    ctx.moveTo(arrowLength - 8, -6);
    ctx.lineTo(arrowLength, 0);
    ctx.lineTo(arrowLength - 8, 6);
    ctx.stroke();

    ctx.restore();

    // Label
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '12px monospace';
    ctx.fillText(`Wind: ${speed.toFixed(1)}`, cx - 25, cy + 30);
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  destroy(): void {
    this.trailHistory = [];
    console.log('Canvas2DRenderer destroyed');
  }
}
