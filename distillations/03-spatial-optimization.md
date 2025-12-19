# Spatial Optimization

## Problem: O(N²) Neighbor Lookup

The naive approach to finding neighbors requires checking every bird against every other bird:

```typescript
// SLOW: O(N²) - 4,000,000 checks for 2,000 birds
for (const bird of birds) {
  for (const other of birds) {
    if (bird.id !== other.id && distance(bird, other) < perceptionRadius) {
      neighbors.push(other);
    }
  }
}
```

## Solution: Spatial Grid

Divide the simulation space into a grid of cells. Only check birds in neighboring cells.

```
┌─────┬─────┬─────┬─────┬─────┐
│     │     │  •  │     │     │
├─────┼─────┼─────┼─────┼─────┤
│     │  •  │  ★  │  •  │     │    ★ = query bird
├─────┼─────┼─────┼─────┼─────┤    • = potential neighbors
│     │     │  •  │  •  │     │    
├─────┼─────┼─────┼─────┼─────┤    Only check 9 cells
│     │     │     │     │     │    instead of entire space
├─────┼─────┼─────┼─────┼─────┤
│     │     │     │     │     │
└─────┴─────┴─────┴─────┴─────┘
```

**Complexity**: O(N × k) where k = average birds per cell (typically 10-50)

---

## SpatialGrid Implementation

### File: `src/simulation/SpatialGrid.ts`

### Class Structure

```typescript
class SpatialGrid {
  private cellSize: number;           // Should match perceptionRadius
  private cols: number;               // Grid columns
  private rows: number;               // Grid rows
  private cells: number[][];          // Each cell contains bird indices
  private width: number;              // Simulation width
  private height: number;             // Simulation height
  
  // Pre-allocated buffers to avoid GC pressure
  private candidateBuffer: number[] = new Array(500);
  private candidateCount: number = 0;
  private neighborBuffer: Bird[] = new Array(100);
  private neighborCount: number = 0;
}
```

### Constructor

```typescript
constructor(width: number, height: number, cellSize: number) {
  this.width = width;
  this.height = height;
  this.cellSize = cellSize;
  
  // Calculate grid dimensions
  this.cols = Math.ceil(width / cellSize);
  this.rows = Math.ceil(height / cellSize);
  
  // Initialize empty cells
  this.cells = [];
  for (let i = 0; i < this.cols * this.rows; i++) {
    this.cells[i] = [];
  }
}
```

### Cell Index Calculation

```typescript
private getCellIndex(x: number, y: number): number {
  // Clamp coordinates to valid range
  const col = Math.floor(Math.max(0, Math.min(x, this.width - 1)) / this.cellSize);
  const row = Math.floor(Math.max(0, Math.min(y, this.height - 1)) / this.cellSize);
  
  // Row-major index
  return row * this.cols + Math.min(col, this.cols - 1);
}
```

### Per-Frame Operations

#### 1. Clear Grid

```typescript
clear(): void {
  // Reset length of each cell array (fast, no allocation)
  for (let i = 0; i < this.cells.length; i++) {
    this.cells[i].length = 0;
  }
}
```

#### 2. Insert All Birds

```typescript
insertAll(birds: Bird[]): void {
  for (let i = 0; i < birds.length; i++) {
    this.insert(birds[i]);
  }
}

insert(bird: Bird): void {
  const cellIndex = this.getCellIndex(bird.position.x, bird.position.y);
  if (cellIndex >= 0 && cellIndex < this.cells.length) {
    this.cells[cellIndex].push(bird.id);
  }
}
```

#### 3. Query Neighbors

```typescript
getNeighbors(
  bird: Bird,
  birds: Bird[],
  radius: number,
  fov?: number
): Bird[] {
  const radiusSq = radius * radius;
  
  // Fill candidate buffer with bird IDs from nearby cells
  this.fillCandidateBuffer(bird.position, radius);
  
  // Reset neighbor count
  this.neighborCount = 0;
  
  // Filter candidates by actual distance and FOV
  for (let i = 0; i < this.candidateCount; i++) {
    const otherId = this.candidateBuffer[i];
    
    // Skip self
    if (otherId === bird.id) continue;
    
    const other = birds[otherId];
    const distSq = bird.position.distSq(other.position);
    
    // Check distance
    if (distSq < radiusSq) {
      // Check field of view if specified
      if (fov === undefined || bird.isInFieldOfView(other.position, fov)) {
        // Grow buffer if needed (rare)
        if (this.neighborCount >= this.neighborBuffer.length) {
          this.neighborBuffer.length = this.neighborBuffer.length * 2;
        }
        this.neighborBuffer[this.neighborCount++] = other;
      }
    }
  }
  
  // Return view into buffer (reused array reference)
  this.neighborBuffer.length = this.neighborCount;
  return this.neighborBuffer;
}
```

### Candidate Collection

```typescript
private fillCandidateBuffer(position: IVector2, radius: number): void {
  this.candidateCount = 0;
  
  // Calculate cell range to check (3x3 or larger depending on radius)
  const minCol = Math.max(0, Math.floor((position.x - radius) / this.cellSize));
  const maxCol = Math.min(this.cols - 1, Math.floor((position.x + radius) / this.cellSize));
  const minRow = Math.max(0, Math.floor((position.y - radius) / this.cellSize));
  const maxRow = Math.min(this.rows - 1, Math.floor((position.y + radius) / this.cellSize));
  
  // Collect bird indices from all cells in range
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const cellIndex = row * this.cols + col;
      const cell = this.cells[cellIndex];
      
      for (let i = 0; i < cell.length; i++) {
        // Grow buffer if needed
        if (this.candidateCount >= this.candidateBuffer.length) {
          this.candidateBuffer.length = this.candidateBuffer.length * 2;
        }
        this.candidateBuffer[this.candidateCount++] = cell[i];
      }
    }
  }
}
```

---

## Performance Analysis

### Without Spatial Grid (O(N²))

| Bird Count | Comparisons | Time per Frame |
|------------|-------------|----------------|
| 500 | 250,000 | ~5ms |
| 1,000 | 1,000,000 | ~20ms |
| 2,000 | 4,000,000 | ~80ms |
| 5,000 | 25,000,000 | ~500ms |

### With Spatial Grid (O(N × k))

Assuming cell size = perception radius (50), ~10-30 birds per cell:

| Bird Count | Avg Checks/Bird | Total Checks | Time per Frame |
|------------|-----------------|--------------|----------------|
| 500 | ~100 | 50,000 | ~1ms |
| 1,000 | ~200 | 200,000 | ~4ms |
| 2,000 | ~400 | 800,000 | ~15ms |
| 5,000 | ~600 | 3,000,000 | ~60ms |

**Speedup**: 4-8x for typical flock sizes

---

## Memory Strategy

### Pre-allocated Buffers

```typescript
// Fixed-size buffers, grown only when necessary
private candidateBuffer: number[] = new Array(500);
private neighborBuffer: Bird[] = new Array(100);
```

**Why?**
- `getNeighbors()` is called N times per frame
- Creating new arrays would trigger GC pauses
- Reusing arrays keeps memory stable

### Buffer Growth Strategy

```typescript
if (this.candidateCount >= this.candidateBuffer.length) {
  this.candidateBuffer.length = this.candidateBuffer.length * 2;
}
```

- Double buffer size when exceeded
- Only happens during initial frames
- After stabilization, zero allocations

---

## Resize Handling

When window resizes:

```typescript
resize(width: number, height: number): void {
  this.width = width;
  this.height = height;
  this.cols = Math.ceil(width / this.cellSize);
  this.rows = Math.ceil(height / this.cellSize);
  
  // Resize cells array
  const newCellCount = this.cols * this.rows;
  while (this.cells.length < newCellCount) {
    this.cells.push([]);
  }
  this.cells.length = newCellCount;
}
```

## Cell Size Update

When perception radius changes:

```typescript
setCellSize(cellSize: number): void {
  this.cellSize = cellSize;
  this.cols = Math.ceil(this.width / cellSize);
  this.rows = Math.ceil(this.height / cellSize);
  
  const newCellCount = this.cols * this.rows;
  while (this.cells.length < newCellCount) {
    this.cells.push([]);
  }
  this.cells.length = newCellCount;
}
```

---

## Utility Methods

### Count Birds in Radius

```typescript
countInRadius(position: IVector2, radius: number, birds: Bird[]): number {
  const radiusSq = radius * radius;
  const candidates = this.getNeighborIndices(position, radius);
  let count = 0;
  
  for (let i = 0; i < candidates.length; i++) {
    const bird = birds[candidates[i]];
    if (bird.position.distSq(position) < radiusSq) {
      count++;
    }
  }
  
  return count;
}
```

### Find Closest Bird

```typescript
findClosest(position: IVector2, birds: Bird[], maxRadius: number): Bird | null {
  const candidates = this.getNeighborIndices(position, maxRadius);
  let closest: Bird | null = null;
  let closestDistSq = maxRadius * maxRadius;
  
  for (let i = 0; i < candidates.length; i++) {
    const bird = birds[candidates[i]];
    const distSq = bird.position.distSq(position);
    
    if (distSq < closestDistSq) {
      closestDistSq = distSq;
      closest = bird;
    }
  }
  
  return closest;
}
```

### Grid Statistics

```typescript
getStats(): {
  totalCells: number;
  occupiedCells: number;
  avgBirdsPerCell: number;
  maxBirdsInCell: number;
} {
  let occupiedCells = 0;
  let totalBirds = 0;
  let maxBirds = 0;
  
  for (let i = 0; i < this.cells.length; i++) {
    const count = this.cells[i].length;
    if (count > 0) {
      occupiedCells++;
      totalBirds += count;
      maxBirds = Math.max(maxBirds, count);
    }
  }
  
  return {
    totalCells: this.cells.length,
    occupiedCells,
    avgBirdsPerCell: occupiedCells > 0 ? totalBirds / occupiedCells : 0,
    maxBirdsInCell: maxBirds
  };
}
```

---

## Integration with Flock

```typescript
// In Flock.fixedUpdate()
private fixedUpdate(dt: number): void {
  // 1. Rebuild spatial grid (clear + insert all)
  this.spatialGrid.clear();
  this.spatialGrid.insertAll(this.birds);
  
  // 2. Process each bird
  for (let i = 0; i < this.birds.length; i++) {
    const bird = this.birds[i];
    
    // Get neighbors using spatial grid (fast!)
    const neighbors = this.spatialGrid.getNeighbors(
      bird,
      this.birds,
      this.config.perceptionRadius,
      this.config.fieldOfView
    );
    
    // Calculate forces using neighbors
    this.rules.calculate(bird, neighbors, this.config, ...);
    bird.applyForce(tempSwarmForce);
    
    // ... rest of update
  }
}
```

---

## Optimal Cell Size

The cell size should approximately match the perception radius:

| Cell Size vs Perception | Effect |
|------------------------|--------|
| Cell < Perception | More cells checked, more overhead |
| Cell = Perception | Optimal - check 9 cells max |
| Cell > Perception | Fewer cells but more birds per cell |

**Rule of thumb**: `cellSize = perceptionRadius` (default 50)

---

## Alternative: Quadtree

For non-uniform distributions, a quadtree might be more efficient:

```
Pros:
- Adapts to density clusters
- Better for sparse distributions

Cons:
- More complex to implement
- Rebuild cost higher
- Cache-unfriendly traversal
```

The uniform grid was chosen for this project because:
1. Bird distribution is relatively uniform
2. Simpler implementation
3. Consistent performance
4. Better cache locality
