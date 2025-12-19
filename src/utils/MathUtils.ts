/**
 * Mathematical utilities for the simulation.
 */

// ============================================================================
// Clamping and Interpolation
// ============================================================================

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function inverseLerp(a: number, b: number, value: number): number {
  if (a === b) return 0;
  return (value - a) / (b - a);
}

export function remap(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number {
  const t = inverseLerp(inMin, inMax, value);
  return lerp(outMin, outMax, t);
}

// ============================================================================
// Random
// ============================================================================

export function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function randomInt(min: number, max: number): number {
  return Math.floor(randomRange(min, max + 1));
}

export function randomSign(): number {
  return Math.random() < 0.5 ? -1 : 1;
}

export function randomGaussian(mean: number = 0, stdDev: number = 1): number {
  // Box-Muller transform
  const u1 = Math.random();
  const u2 = Math.random();
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return z0 * stdDev + mean;
}

// ============================================================================
// Perlin Noise (Simplified 2D Implementation)
// ============================================================================

const PERLIN_SIZE = 256;
const PERLIN_MASK = PERLIN_SIZE - 1;

let perlinPermutation: number[] | null = null;
let perlinGradients: Array<[number, number]> | null = null;

function initPerlin(): void {
  if (perlinPermutation) return;

  // Initialize permutation table
  perlinPermutation = [];
  for (let i = 0; i < PERLIN_SIZE; i++) {
    perlinPermutation[i] = i;
  }

  // Shuffle
  for (let i = PERLIN_SIZE - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [perlinPermutation[i], perlinPermutation[j]] = [perlinPermutation[j], perlinPermutation[i]];
  }

  // Double for overflow
  for (let i = 0; i < PERLIN_SIZE; i++) {
    perlinPermutation[PERLIN_SIZE + i] = perlinPermutation[i];
  }

  // Initialize gradients
  perlinGradients = [];
  for (let i = 0; i < PERLIN_SIZE; i++) {
    const angle = (i / PERLIN_SIZE) * Math.PI * 2;
    perlinGradients[i] = [Math.cos(angle), Math.sin(angle)];
  }
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function dotGrad(ix: number, iy: number, x: number, y: number): number {
  if (!perlinPermutation || !perlinGradients) return 0;
  const idx = perlinPermutation[(ix + perlinPermutation[iy & PERLIN_MASK]) & PERLIN_MASK] & PERLIN_MASK;
  const grad = perlinGradients[idx];
  const dx = x - ix;
  const dy = y - iy;
  return dx * grad[0] + dy * grad[1];
}

/**
 * 2D Perlin noise function.
 * Returns values in range [-1, 1]
 */
export function noise(x: number, y: number): number {
  initPerlin();

  const x0 = Math.floor(x);
  const x1 = x0 + 1;
  const y0 = Math.floor(y);
  const y1 = y0 + 1;

  const sx = fade(x - x0);
  const sy = fade(y - y0);

  const n00 = dotGrad(x0, y0, x, y);
  const n10 = dotGrad(x1, y0, x, y);
  const n01 = dotGrad(x0, y1, x, y);
  const n11 = dotGrad(x1, y1, x, y);

  const ix0 = lerp(n00, n10, sx);
  const ix1 = lerp(n01, n11, sx);

  return lerp(ix0, ix1, sy);
}

/**
 * Fractal Brownian Motion (multi-octave noise)
 */
export function fbm(
  x: number,
  y: number,
  octaves: number = 4,
  lacunarity: number = 2,
  gain: number = 0.5
): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise(x * frequency, y * frequency);
    maxValue += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return value / maxValue;
}

// ============================================================================
// Angle Utilities
// ============================================================================

export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;

export function degToRad(degrees: number): number {
  return degrees * DEG_TO_RAD;
}

export function radToDeg(radians: number): number {
  return radians * RAD_TO_DEG;
}

export function normalizeAngle(angle: number): number {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

export function angleDifference(a: number, b: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

// ============================================================================
// Color Utilities
// ============================================================================

export function hexToRgb(hex: number): { r: number; g: number; b: number } {
  return {
    r: (hex >> 16) & 0xff,
    g: (hex >> 8) & 0xff,
    b: hex & 0xff
  };
}

export function rgbToHex(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b;
}

export function lerpColor(color1: number, color2: number, t: number): number {
  const c1 = hexToRgb(color1);
  const c2 = hexToRgb(color2);

  const r = Math.round(lerp(c1.r, c2.r, t));
  const g = Math.round(lerp(c1.g, c2.g, t));
  const b = Math.round(lerp(c1.b, c2.b, t));

  return rgbToHex(r, g, b);
}

// ============================================================================
// Distance Utilities
// ============================================================================

export function distance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

export function distanceSq(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
}

// ============================================================================
// Array Utilities
// ============================================================================

export function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function pickRandom<T>(array: T[]): T | undefined {
  if (array.length === 0) return undefined;
  return array[Math.floor(Math.random() * array.length)];
}


