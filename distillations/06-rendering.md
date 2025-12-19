# Rendering Architecture

## Overview

The rendering system uses `@flux-gpu/core` for unified WebGPU-accelerated graphics. Both simulation compute and rendering share the same GPU device context, eliminating CPU-GPU data transfer overhead.

```
┌─────────────────────────────────────────────────────────────────┐
│                      Flux GPU Context                           │
│                    (Unified WebGPU Device)                      │
└─────────────────────────────────────────────────────────────────┘
         │
         ├──► Compute Pipelines (simulation)
         │      ├──► Flocking shader
         │      └──► Physics shader
         │
         └──► Render Pipelines (visualization)
                ├──► FlockRenderer (instanced birds)
                ├──► EnvironmentRenderer (circles, triangles)
                ├──► TrailEffect (line segments)
                └──► Wind indicator
```

---

## Flux GPU Initialization

### In App.ts

```typescript
import { createFlux, Flux } from '@flux-gpu/core';

async init(): Promise<void> {
  // Create canvas
  this.canvas = document.createElement('canvas');
  this.canvas.width = window.innerWidth;
  this.canvas.height = window.innerHeight;
  this.container.appendChild(this.canvas);

  // Initialize Flux with shared GPU context
  this.flux = await createFlux({
    canvas: this.canvas,
    powerPreference: 'high-performance',
  });

  // Initialize renderers with shared context
  this.flockRenderer = new FlockRenderer(this.flux, this.renderConfig, MAX_BIRDS);
  this.envRenderer = new EnvironmentRenderer(this.flux, width, height);
  this.trailEffect = new TrailEffect(this.flux, MAX_BIRDS, trailLength, trailColor);

  // Initialize GPU compute with same device
  await this.flock.initGPUWithFlux(this.flux);
}
```

---

## FlockRenderer

### File: `src/rendering/FlockRenderer.ts`

Renders birds as instanced triangles using WGSL shaders.

### WGSL Shader

```wgsl
struct Uniforms {
  screen_width: f32,
  screen_height: f32,
  particle_size: f32,
  time: f32,
}

struct BirdData {
  position: vec2f,
  heading: f32,
  color: u32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> birds: array<BirdData>;

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_idx: u32,
  @builtin(instance_index) instance_idx: u32
) -> VertexOutput {
  let bird = birds[instance_idx];
  
  // Arrow shape vertices (3 per triangle)
  var local_pos: vec2f;
  let size = uniforms.particle_size * 4.0;
  
  switch vertex_idx {
    case 0u: { local_pos = vec2f(size, 0.0); }         // tip
    case 1u: { local_pos = vec2f(-size * 0.5, size * 0.4); }
    case 2u: { local_pos = vec2f(-size * 0.5, -size * 0.4); }
    default: { local_pos = vec2f(0.0, 0.0); }
  }
  
  // Rotate by heading
  let cos_h = cos(bird.heading);
  let sin_h = sin(bird.heading);
  let rotated = vec2f(
    local_pos.x * cos_h - local_pos.y * sin_h,
    local_pos.x * sin_h + local_pos.y * cos_h
  );
  
  // Transform to clip space
  let world_pos = bird.position + rotated;
  let clip_x = (world_pos.x / uniforms.screen_width) * 2.0 - 1.0;
  let clip_y = 1.0 - (world_pos.y / uniforms.screen_height) * 2.0;
  
  var output: VertexOutput;
  output.position = vec4f(clip_x, clip_y, 0.0, 1.0);
  output.color = unpack_color(bird.color);
  return output;
}

@fragment
fn fs_main(@location(0) color: vec4f) -> @location(0) vec4f {
  return color;
}
```

### Render Method

```typescript
render(
  renderPass: GPURenderPassEncoder,
  birdArrays: BirdArrays,
  screenWidth: number,
  screenHeight: number
): void {
  // Pack bird data: [posX, posY, heading, color]
  for (let i = 0; i < count; i++) {
    const offset = i * 4;
    this.birdDataCPU[offset] = birdArrays.positionX[i];
    this.birdDataCPU[offset + 1] = birdArrays.positionY[i];
    this.birdDataCPU[offset + 2] = birdArrays.heading[i];
    // Pack color as u32 bits
    const colorView = new DataView(this.birdDataCPU.buffer);
    colorView.setUint32((offset + 3) * 4, this.colorCache[i], true);
  }

  // Upload to GPU
  this.flux.device.queue.writeBuffer(this.birdDataBuffer, 0, this.birdDataCPU);

  // Draw instanced
  renderPass.setPipeline(this.pipeline);
  renderPass.setBindGroup(0, this.bindGroup);
  renderPass.draw(3, count); // 3 vertices, count instances
}
```

---

## EnvironmentRenderer

### File: `src/rendering/EnvironmentRenderer.ts`

Renders environment elements using multiple WGSL pipelines:

| Element | Geometry | Instanced |
|---------|----------|-----------|
| Food sources | Circles (quads + SDF) | Yes |
| Attractors | Pulsing rings | Yes |
| Predators | Triangles | Yes |
| Wind indicator | Arrow | No |

### Circle Rendering (SDF approach)

```wgsl
@fragment
fn fs_main(
  @location(0) color: vec4f,
  @location(1) local_pos: vec2f,
  @location(2) style: f32
) -> @location(0) vec4f {
  let dist = length(local_pos);
  
  // Discard outside circle
  if (dist > 1.0) { discard; }
  
  // Ring style - only draw edge
  if (style > 0.5) {
    let ring_width = 0.15;
    if (dist < 1.0 - ring_width) { discard; }
    let edge_alpha = smoothstep(1.0, 0.95, dist);
    return vec4f(color.rgb, color.a * edge_alpha);
  }
  
  // Filled circle with soft edge
  let edge_alpha = 1.0 - smoothstep(0.8, 1.0, dist);
  return vec4f(color.rgb, color.a * edge_alpha);
}
```

---

## TrailEffect

### File: `src/rendering/TrailEffect.ts`

Renders motion trails as GPU line segments.

### Data Structure

```typescript
interface TrailSegment {
  start_pos: vec2f,  // Start point
  end_pos: vec2f,    // End point
  alpha: f32,        // Opacity (fades over time)
  width: f32,        // Line thickness
}
```

### Line Rendering

Lines are rendered as screen-space quads with 6 vertices per segment:

```wgsl
@vertex
fn vs_main(
  @builtin(vertex_index) vertex_idx: u32,
  @builtin(instance_index) instance_idx: u32
) -> VertexOutput {
  let seg = segments[instance_idx];
  
  // Line direction and perpendicular
  let dir = seg.end_pos - seg.start_pos;
  let norm_dir = normalize(dir);
  let perp = vec2f(-norm_dir.y, norm_dir.x) * seg.width;
  
  // Quad vertices
  switch vertex_idx {
    case 0u: { local_pos = seg.start_pos - perp; }
    case 1u: { local_pos = seg.start_pos + perp; }
    case 2u: { local_pos = seg.end_pos - perp; }
    case 3u: { local_pos = seg.start_pos + perp; }
    case 4u: { local_pos = seg.end_pos + perp; }
    case 5u: { local_pos = seg.end_pos - perp; }
    default: { local_pos = vec2f(0.0, 0.0); }
  }
  // ...
}
```

---

## Render Loop

### Frame Structure

```typescript
private render(): void {
  const batch = this.flux.batch('frame');
  const view = this.flux.getCurrentTextureView();

  const renderPass = batch.renderPass({
    colorAttachments: [{
      view,
      clearValue: { r: bgR, g: bgG, b: bgB, a: 1 },
      loadOp: 'clear',
      storeOp: 'store',
    }],
  });

  const pass = renderPass.native;

  // Layer order (back to front):
  // 1. Trails
  if (this.renderConfig.trailEnabled) {
    this.trailEffect.render(pass, screenWidth, screenHeight);
  }

  // 2. Environment
  this.envRenderer.renderWind(pass, ...);
  this.envRenderer.renderFood(pass, foodSources);
  this.envRenderer.renderAttractors(pass, attractors);
  this.envRenderer.renderPredators(pass, predators);

  // 3. Birds (topmost)
  this.flockRenderer.render(pass, birdArrays, screenWidth, screenHeight);

  renderPass.end();
  batch.submit();
}
```

---

## Color Modes

Colors are calculated on CPU and packed as u32:

```typescript
private calculateTints(birdArrays: BirdArrays): void {
  switch (this.config.colorMode) {
    case 'solid':
      // Single color for all birds
      break;
    case 'density':
      // Interpolate based on local neighbor count
      break;
    case 'speed':
      // Interpolate based on velocity magnitude
      break;
    case 'panic':
      // Interpolate based on panic level
      break;
    case 'gender':
      // Binary male/female colors
      break;
    case 'mating':
      // State-based mating colors
      break;
  }
}
```

### Color Unpacking in WGSL

```wgsl
fn unpack_color(packed: u32) -> vec4f {
  let r = f32((packed >> 16u) & 0xFFu) / 255.0;
  let g = f32((packed >> 8u) & 0xFFu) / 255.0;
  let b = f32(packed & 0xFFu) / 255.0;
  return vec4f(r, g, b, 1.0);
}
```

---

## Performance Characteristics

| Aspect | Value |
|--------|-------|
| Birds rendered | Up to 10,000 |
| Draw calls per frame | 4-6 (instanced) |
| GPU memory | ~1MB for 10k birds |
| Frame time target | <16ms (60 FPS) |

### Optimizations

1. **Instanced Rendering**: All birds rendered in a single draw call
2. **Packed Data**: Bird data packed as 16 bytes per bird
3. **Shared GPU Context**: Compute and render share same device
4. **Minimal State Changes**: Single pipeline per element type
5. **SDF Circles**: No geometry tessellation needed

---

## Pipeline Configuration

All pipelines use alpha blending:

```typescript
{
  blend: {
    color: {
      srcFactor: 'src-alpha',
      dstFactor: 'one-minus-src-alpha',
      operation: 'add',
    },
    alpha: {
      srcFactor: 'one',
      dstFactor: 'one-minus-src-alpha',
      operation: 'add',
    },
  },
}
```
