# Development & Architecture

This document provides technical details on the project structure, performance optimizations, and development workflow.

## Project Structure

- `src/main.ts`: Entry point, handles initial configuration loading.
- `src/App.ts`: Main orchestrator, manages the game loop and subsystems.
- `src/simulation/`: Core logic including Boids (`SwarmRules.ts`), individual agents (`Bird.ts`), and the collection manager (`Flock.ts`).
- `src/rendering/`: Visualization logic. Uses WebGPU for high-performance rendering.
- `src/environment/`: External factors like Predators, Food, and Wind.
- `src/ui/`: Tweakpane integration for real-time control.
- `src/utils/`: Performance-focused utilities (Vector math, Object pooling).

## Performance Optimizations

### 1. Zero-Allocation Strategy
The simulation is designed to be GC-friendly. In the "hot" update loops:
- We use pre-allocated temporary vectors (`tempVector`) instead of creating new ones.
- Methods often take an "out" parameter to store results.
- Object pooling is used for frequently created/destroyed objects.

### 2. Spatial Partitioning
We use a **Spatial Grid** to reduce neighbor lookup from O(n²) to roughly O(n*k), where k is the average number of birds per grid cell. This is essential for simulating >1000 agents smoothly.

### 3. Structure of Arrays (SoA)
Data is organized in a Structure-of-Arrays format (`BirdArrays`) to improve cache locality and simplify data transfer to the GPU for compute shaders.

### 4. GPU Acceleration
While the CPU handles complex behavioral logic, the rendering (and optionally some compute parts) is offloaded to the GPU via **WebGPU**, allowing for massive particle counts with motion trails and glow effects.

## Development Workflow

### Scripts
- `npm run dev`: Starts the Vite development server with hot module replacement.
- `npm run build`: Compiles TypeScript and builds the production bundle.
- `npm run preview`: Previews the production build locally.

### Configuration
The default configuration is stored in `public/config.json`. This includes:
- Simulation weights (Alignment, Cohesion, Separation).
- Environment settings (Wind, Predator types, Food).
- Rendering colors and effects.
- Creature presets (Starlings, Insects, etc.).

### Adding a New Predator
To add a new predator:
1. Create a new class extending `BasePredator` in `src/environment/predators/`.
2. Implement the required abstract methods and target scoring weights.
3. Register the new predator in `PredatorFactory.ts`.
4. Add it to the UI in `ControlPanel.ts`.

