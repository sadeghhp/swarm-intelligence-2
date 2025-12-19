import type { IGridCell } from '../types';

/**
 * Uniform spatial grid for efficient neighbor queries.
 * Reduces neighbor lookup from O(N²) to O(N×k) where k is average neighbors per cell.
 */
export class SpatialGrid {
  private cellSize: number;
  private cols: number;
  private rows: number;
  private width: number;
  private height: number;
  private cells: IGridCell[];
  
  // Reusable array for cell indices
  private _neighborCells: number[] = [];

  constructor(width: number, height: number, cellSize: number) {
    this.width = width;
    this.height = height;
    this.cellSize = cellSize;
    this.cols = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
    
    // Pre-allocate cells
    const totalCells = this.cols * this.rows;
    this.cells = new Array(totalCells);
    for (let i = 0; i < totalCells; i++) {
      this.cells[i] = { birdIds: [] };
    }
  }

  /**
   * Get cell index from position.
   */
  getCellIndex(x: number, y: number): number {
    const col = Math.floor(Math.max(0, Math.min(x, this.width - 1)) / this.cellSize);
    const row = Math.floor(Math.max(0, Math.min(y, this.height - 1)) / this.cellSize);
    return row * this.cols + col;
  }

  /**
   * Get cell from position.
   */
  getCell(x: number, y: number): IGridCell | null {
    const idx = this.getCellIndex(x, y);
    return this.cells[idx] || null;
  }

  /**
   * Clear all cells.
   */
  clear(): void {
    for (const cell of this.cells) {
      cell.birdIds.length = 0;
    }
  }

  /**
   * Insert a bird ID at position.
   */
  insert(birdId: number, x: number, y: number): void {
    const idx = this.getCellIndex(x, y);
    if (idx >= 0 && idx < this.cells.length) {
      this.cells[idx].birdIds.push(birdId);
    }
  }

  /**
   * Remove a bird ID from position.
   */
  remove(birdId: number, x: number, y: number): void {
    const idx = this.getCellIndex(x, y);
    if (idx >= 0 && idx < this.cells.length) {
      const birds = this.cells[idx].birdIds;
      const birdIdx = birds.indexOf(birdId);
      if (birdIdx !== -1) {
        birds.splice(birdIdx, 1);
      }
    }
  }

  /**
   * Get all bird IDs in cells within radius of position.
   * Returns reusable array - do not store reference!
   */
  getNeighborIds(
    x: number,
    y: number,
    radius: number,
    excludeId: number = -1
  ): number[] {
    const result: number[] = [];
    
    // Calculate cell range to check
    const minCol = Math.max(0, Math.floor((x - radius) / this.cellSize));
    const maxCol = Math.min(this.cols - 1, Math.floor((x + radius) / this.cellSize));
    const minRow = Math.max(0, Math.floor((y - radius) / this.cellSize));
    const maxRow = Math.min(this.rows - 1, Math.floor((y + radius) / this.cellSize));

    // Iterate over cells in range
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const cellIdx = row * this.cols + col;
        const birds = this.cells[cellIdx].birdIds;
        
        for (const birdId of birds) {
          if (birdId !== excludeId) {
            result.push(birdId);
          }
        }
      }
    }

    return result;
  }

  /**
   * Get cell indices that are within radius of position.
   * Returns internal reusable array.
   */
  getNeighborCellIndices(x: number, y: number, radius: number): number[] {
    this._neighborCells.length = 0;
    
    const minCol = Math.max(0, Math.floor((x - radius) / this.cellSize));
    const maxCol = Math.min(this.cols - 1, Math.floor((x + radius) / this.cellSize));
    const minRow = Math.max(0, Math.floor((y - radius) / this.cellSize));
    const maxRow = Math.min(this.rows - 1, Math.floor((y + radius) / this.cellSize));

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        this._neighborCells.push(row * this.cols + col);
      }
    }

    return this._neighborCells;
  }

  /**
   * Rebuild grid from positions arrays (SoA format).
   */
  rebuildFromArrays(
    positionX: Float32Array,
    positionY: Float32Array,
    count: number
  ): void {
    // Clear all cells
    this.clear();

    // Insert all birds
    for (let i = 0; i < count; i++) {
      this.insert(i, positionX[i], positionY[i]);
    }
  }

  /**
   * Resize the grid.
   */
  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;

    this.width = width;
    this.height = height;
    this.cols = Math.ceil(width / this.cellSize);
    this.rows = Math.ceil(height / this.cellSize);

    // Reallocate cells
    const totalCells = this.cols * this.rows;
    this.cells = new Array(totalCells);
    for (let i = 0; i < totalCells; i++) {
      this.cells[i] = { birdIds: [] };
    }
  }

  /**
   * Get statistics about the grid.
   */
  getStats(): {
    totalCells: number;
    occupiedCells: number;
    avgBirdsPerCell: number;
    maxBirdsPerCell: number;
  } {
    let occupiedCells = 0;
    let totalBirds = 0;
    let maxBirds = 0;

    for (const cell of this.cells) {
      if (cell.birdIds.length > 0) {
        occupiedCells++;
        totalBirds += cell.birdIds.length;
        maxBirds = Math.max(maxBirds, cell.birdIds.length);
      }
    }

    return {
      totalCells: this.cells.length,
      occupiedCells,
      avgBirdsPerCell: occupiedCells > 0 ? totalBirds / occupiedCells : 0,
      maxBirdsPerCell: maxBirds
    };
  }

  // Getters
  get gridWidth(): number { return this.cols; }
  get gridHeight(): number { return this.rows; }
  get getCellSize(): number { return this.cellSize; }
}


