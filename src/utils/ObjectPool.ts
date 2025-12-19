import type { IPoolable } from '../types';

/**
 * Generic object pool for reducing garbage collection pressure.
 * Objects must implement the IPoolable interface.
 */
export class ObjectPool<T extends IPoolable> {
  private pool: T[] = [];
  private factory: () => T;
  private maxSize: number;
  private activeCount: number = 0;

  constructor(factory: () => T, initialSize: number = 100, maxSize: number = 10000) {
    this.factory = factory;
    this.maxSize = maxSize;

    // Pre-allocate initial pool
    for (let i = 0; i < initialSize; i++) {
      const obj = this.factory();
      obj.isActive = false;
      this.pool.push(obj);
    }
  }

  /**
   * Get an object from the pool, creating a new one if necessary.
   */
  acquire(): T {
    let obj: T | undefined;

    // Find an inactive object
    for (let i = 0; i < this.pool.length; i++) {
      if (!this.pool[i].isActive) {
        obj = this.pool[i];
        break;
      }
    }

    // Create new if none available
    if (!obj) {
      if (this.pool.length < this.maxSize) {
        obj = this.factory();
        this.pool.push(obj);
      } else {
        // Pool is full, reuse oldest (this shouldn't happen often)
        console.warn('ObjectPool: Max size reached, reusing object');
        obj = this.pool[0];
        obj.reset();
      }
    }

    obj.isActive = true;
    obj.reset();
    this.activeCount++;
    return obj;
  }

  /**
   * Return an object to the pool.
   */
  release(obj: T): void {
    if (obj.isActive) {
      obj.isActive = false;
      obj.reset();
      this.activeCount--;
    }
  }

  /**
   * Release all objects back to the pool.
   */
  releaseAll(): void {
    for (const obj of this.pool) {
      if (obj.isActive) {
        obj.isActive = false;
        obj.reset();
      }
    }
    this.activeCount = 0;
  }

  /**
   * Get the current pool size.
   */
  get size(): number {
    return this.pool.length;
  }

  /**
   * Get the number of active objects.
   */
  get active(): number {
    return this.activeCount;
  }

  /**
   * Get the number of available (inactive) objects.
   */
  get available(): number {
    return this.pool.length - this.activeCount;
  }

  /**
   * Pre-warm the pool with additional objects.
   */
  prewarm(count: number): void {
    const toCreate = Math.min(count, this.maxSize - this.pool.length);
    for (let i = 0; i < toCreate; i++) {
      const obj = this.factory();
      obj.isActive = false;
      this.pool.push(obj);
    }
  }

  /**
   * Shrink the pool to a specific size, removing inactive objects.
   */
  shrink(targetSize: number): void {
    if (targetSize >= this.pool.length) return;

    const newPool: T[] = [];
    let addedCount = 0;

    // First, keep all active objects
    for (const obj of this.pool) {
      if (obj.isActive) {
        newPool.push(obj);
        addedCount++;
      } else if (addedCount < targetSize) {
        newPool.push(obj);
        addedCount++;
      }
    }

    this.pool = newPool;
  }
}

/**
 * Simple poolable wrapper for basic types.
 */
export class PoolableValue<T> implements IPoolable {
  public value: T;
  public isActive: boolean = false;
  private defaultValue: T;

  constructor(defaultValue: T) {
    this.defaultValue = defaultValue;
    this.value = defaultValue;
  }

  reset(): void {
    this.value = this.defaultValue;
  }
}


