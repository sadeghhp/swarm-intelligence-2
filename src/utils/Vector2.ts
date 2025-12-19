import type { IVector2 } from '../types';

/**
 * 2D Vector class with common operations.
 * Methods return `this` for chaining where appropriate.
 */
export class Vector2 implements IVector2 {
  public x: number;
  public y: number;

  constructor(x: number = 0, y: number = 0) {
    this.x = x;
    this.y = y;
  }

  // ============================================================================
  // Factory Methods
  // ============================================================================

  static create(x: number = 0, y: number = 0): Vector2 {
    return new Vector2(x, y);
  }

  static random(): Vector2 {
    const angle = Math.random() * Math.PI * 2;
    return new Vector2(Math.cos(angle), Math.sin(angle));
  }

  static fromAngle(angle: number): Vector2 {
    return new Vector2(Math.cos(angle), Math.sin(angle));
  }

  static fromObject(obj: IVector2): Vector2 {
    return new Vector2(obj.x, obj.y);
  }

  // ============================================================================
  // Basic Operations
  // ============================================================================

  set(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  copy(v: IVector2): this {
    this.x = v.x;
    this.y = v.y;
    return this;
  }

  clone(): Vector2 {
    return new Vector2(this.x, this.y);
  }

  zero(): this {
    this.x = 0;
    this.y = 0;
    return this;
  }

  isZero(): boolean {
    return this.x === 0 && this.y === 0;
  }

  // ============================================================================
  // Arithmetic Operations
  // ============================================================================

  add(v: IVector2): this {
    this.x += v.x;
    this.y += v.y;
    return this;
  }

  addScaled(v: IVector2, scale: number): this {
    this.x += v.x * scale;
    this.y += v.y * scale;
    return this;
  }

  sub(v: IVector2): this {
    this.x -= v.x;
    this.y -= v.y;
    return this;
  }

  mult(scalar: number): this {
    this.x *= scalar;
    this.y *= scalar;
    return this;
  }

  div(scalar: number): this {
    if (scalar !== 0) {
      this.x /= scalar;
      this.y /= scalar;
    }
    return this;
  }

  // ============================================================================
  // Magnitude Operations
  // ============================================================================

  mag(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  magSq(): number {
    return this.x * this.x + this.y * this.y;
  }

  normalize(): this {
    const m = this.mag();
    if (m > 0) {
      this.x /= m;
      this.y /= m;
    }
    return this;
  }

  setMag(mag: number): this {
    const m = this.mag();
    if (m > 0) {
      this.x = (this.x / m) * mag;
      this.y = (this.y / m) * mag;
    }
    return this;
  }

  limit(max: number): this {
    const magSq = this.magSq();
    if (magSq > max * max) {
      const m = Math.sqrt(magSq);
      this.x = (this.x / m) * max;
      this.y = (this.y / m) * max;
    }
    return this;
  }

  // ============================================================================
  // Distance Operations
  // ============================================================================

  dist(v: IVector2): number {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  distSq(v: IVector2): number {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    return dx * dx + dy * dy;
  }

  // ============================================================================
  // Angular Operations
  // ============================================================================

  heading(): number {
    return Math.atan2(this.y, this.x);
  }

  rotate(angle: number): this {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const newX = this.x * cos - this.y * sin;
    const newY = this.x * sin + this.y * cos;
    this.x = newX;
    this.y = newY;
    return this;
  }

  angleBetween(v: IVector2): number {
    const dot = this.dot(v);
    const m1 = this.mag();
    const m2 = Math.sqrt(v.x * v.x + v.y * v.y);
    if (m1 === 0 || m2 === 0) return 0;
    return Math.acos(Math.max(-1, Math.min(1, dot / (m1 * m2))));
  }

  // ============================================================================
  // Vector Products
  // ============================================================================

  dot(v: IVector2): number {
    return this.x * v.x + this.y * v.y;
  }

  cross(v: IVector2): number {
    return this.x * v.y - this.y * v.x;
  }

  // ============================================================================
  // Interpolation
  // ============================================================================

  lerp(v: IVector2, t: number): this {
    this.x += (v.x - this.x) * t;
    this.y += (v.y - this.y) * t;
    return this;
  }

  // ============================================================================
  // Utility
  // ============================================================================

  toString(): string {
    return `Vector2(${this.x.toFixed(2)}, ${this.y.toFixed(2)})`;
  }

  toArray(): [number, number] {
    return [this.x, this.y];
  }

  equals(v: IVector2, epsilon: number = 0.0001): boolean {
    return Math.abs(this.x - v.x) < epsilon && Math.abs(this.y - v.y) < epsilon;
  }
}

// Pre-allocated temporary vectors for calculations
export const tempVec1 = new Vector2();
export const tempVec2 = new Vector2();
export const tempVec3 = new Vector2();
export const tempVec4 = new Vector2();


