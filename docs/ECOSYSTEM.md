# Ecosystem Systems

The Swarm Intelligence Simulator features a complex ecosystem including predators, food sources, mating, and energy management.

## Predator System

Predators are autonomous agents that hunt the swarm. There are 8 specialized predator types:

- **Hawk**: Circles the flock and strikes isolated birds on the edges.
- **Falcon**: Climbs to high altitude and performs high-speed "stoop" dives.
- **Eagle**: Performs sustained pursuit of a single target.
- **Owl**: Uses stealth and ambush tactics, only becoming visible when close.
- **Shark**: Circles the flock in a tightening spiral.
- **Orca**: Pack hunters (when multiple are present) that coordinate attacks.
- **Barracuda**: Uses sudden bursts of speed from a stationary position.
- **Sea Lion**: Highly agile, making quick turns to stay on target.

### Hunting Logic
Predators use a scoring algorithm to select the "best" prey based on:
1. **Isolation**: How far the bird is from its neighbors.
2. **Edge Distance**: How far the bird is from the flock center.
3. **Velocity**: Whether the bird is moving away from safety.
4. **Panic**: Already panicked birds are easier to catch.

## Food System

Food sources can be spawned manually or automatically.

- **Interaction**: Birds are attracted to food when their energy is low.
- **State Machine**: Birds transition from `Approaching` -> `Gathering` -> `Feeding`.
- **Consumption**: Food sources have limited capacity and replenish over time.
- **Competition**: Only a certain number of birds can feed on a single source simultaneously.

## Mating System

A complex behavioral system for population dynamics (visualized through colors and behaviors).

- **Phases**: Seeking -> Approaching -> Courting -> Mating -> Cooldown.
- **Female Selectivity**: Females may reject males based on certain criteria.
- **Male Competition**: If two males target the same female, they may "fight" (repel each other) until a winner is determined.
- **Suppression**: High panic (predator nearby) or low energy suppresses mating behaviors.

## Energy System

The energy system adds a layer of resource management to the simulation.

- **Consumption**: Energy decays over time, faster at higher speeds.
- **Effect**: Low energy reduces a bird's maximum speed and prevents mating.
- **Restoration**: Energy is restored by feeding at food sources.
- **Visuals**: If enabled, energy levels can be visualized through color gradients or statistics.
