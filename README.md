# Swarm Intelligence Simulator

A high-performance, real-time swarm intelligence simulation built with TypeScript and WebGPU. This project implements Reynolds' Boids algorithm with advanced ecosystem features, environmental forces, and various optimizations for simulating thousands of agents.

## Features

- **Advanced Flocking Algorithm**: Implementation of Alignment, Cohesion, and Separation rules.
- **Ecosystem Interactions**:
  - **Predators**: Multiple predator types (Hawk, Falcon, Eagle, Owl, Shark, etc.) with unique hunting behaviors.
  - **Food Sources**: Dynamic food spawning and gathering mechanics.
  - **Mating System**: Complex mating behaviors including searching, courting, and cooldowns.
- **Environmental Forces**:
  - **Wind**: Global wind system with turbulence.
  - **Attractors/Repulsors**: User-interactive force sources (Click/Right-click).
- **High Performance**:
  - **WebGPU Acceleration**: Utilizes GPU for rendering and computation.
  - **Spatial Partitioning**: O(n*k) neighbor lookup using a Spatial Grid.
  - **Zero-Allocation Strategy**: Optimized memory usage in hot loops to prevent GC spikes.
  - **Fixed Timestep Physics**: Deterministic simulation regardless of frame rate.
- **Interactive Control**:
  - **Real-time Configuration**: Tweakpane-powered UI for adjusting all simulation parameters.
  - **Creature Presets**: 12+ built-in presets (Starlings, Insects, Fish, Bats, etc.).
  - **Custom Presets**: Save, load, export, and import your own configurations.
  - **Statistics**: Real-time performance and population metrics.

## Tech Stack

- **Language**: TypeScript
- **Build Tool**: Vite
- **Rendering/Compute**: [flux-gpu](https://github.com/...) (WebGPU)
- **UI**: Tweakpane
- **Math**: Custom 2D Vector library with object pooling

## Getting Started

### Prerequisites

- Node.js (Latest LTS recommended)
- A browser with WebGPU support (Chrome 113+, Edge 113+)

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd swarm-intelligence-2
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Build for production:
   ```bash
   npm run build
   ```

## Usage

- **Left Click**: Spawn an Attractor (pulls birds).
- **Right Click**: Spawn a Repulsor (pushes birds).
- **Shift + Click**: Spawn a Food Source (if enabled).
- **Control Panel**: Use the sidebar to switch between creature presets or manually adjust behaviors, environment, and rendering settings.

## Documentation

Detailed documentation is available in the `docs/` directory:

- [**Simulation Engine**](docs/SIMULATION.md): Details on the Boids algorithm, physics, and spatial optimization.
- [**Ecosystem Systems**](docs/ECOSYSTEM.md): Deep dive into Predators, Food, Mating, and Energy systems.
- [**Development & Architecture**](docs/DEVELOPMENT.md): Technical overview, project structure, and performance optimizations.

Additional technical notes can be found in the `distillations/` folder.

## License

MIT
