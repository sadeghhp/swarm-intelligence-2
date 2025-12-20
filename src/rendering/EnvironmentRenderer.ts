import type { Flux } from '@flux-gpu/core';
import type { IAttractor, IFoodSource } from '../types';
import type { BasePredator } from '../environment/predators/BasePredator';

// Version: 1.1.0 - Fixed WGSL shader compatibility

/**
 * WGSL shader for rendering environment elements (circles, indicators).
 */
const ENV_SHADER = `
struct Uniforms {
  screen_width: f32,
  screen_height: f32,
  time: f32,
  _padding: f32,
}

struct InstanceData {
  position: vec2f,
  radius: f32,
  color: u32,
  alpha: f32,
  style: f32, // 0 = filled, 1 = ring
  _pad: vec2f,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> instances: array<InstanceData>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
  @location(1) local_pos: vec2f,
  @location(2) style: f32,
}

fn unpack_color(packed: u32) -> vec3f {
  let r = f32((packed >> 16u) & 0xFFu) / 255.0;
  let g = f32((packed >> 8u) & 0xFFu) / 255.0;
  let b = f32(packed & 0xFFu) / 255.0;
  return vec3f(r, g, b);
}

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_idx: u32,
  @builtin(instance_index) instance_idx: u32
) -> VertexOutput {
  let inst = instances[instance_idx];
  
  // Quad vertices for circle billboard - initialized with default
  var local_pos = vec2f(0.0, 0.0);
  if (vertex_idx == 0u) {
    local_pos = vec2f(-1.0, -1.0);
  } else if (vertex_idx == 1u) {
    local_pos = vec2f(1.0, -1.0);
  } else if (vertex_idx == 2u) {
    local_pos = vec2f(-1.0, 1.0);
  } else if (vertex_idx == 3u) {
    local_pos = vec2f(1.0, -1.0);
  } else if (vertex_idx == 4u) {
    local_pos = vec2f(1.0, 1.0);
  } else if (vertex_idx == 5u) {
    local_pos = vec2f(-1.0, 1.0);
  }
  
  let world_pos = inst.position + local_pos * inst.radius;
  
  let clip_x = (world_pos.x / uniforms.screen_width) * 2.0 - 1.0;
  let clip_y = 1.0 - (world_pos.y / uniforms.screen_height) * 2.0;
  
  var output: VertexOutput;
  output.position = vec4f(clip_x, clip_y, 0.0, 1.0);
  output.color = vec4f(unpack_color(inst.color), inst.alpha);
  output.local_pos = local_pos;
  output.style = inst.style;
  return output;
}

@fragment
fn fs_main(
  @location(0) color: vec4f,
  @location(1) local_pos: vec2f,
  @location(2) style: f32
) -> @location(0) vec4f {
  let dist = length(local_pos);
  
  // Discard outside circle
  if (dist > 1.0) {
    discard;
  }
  
  // Ring style - only draw edge
  if (style > 0.5) {
    let ring_width = 0.15;
    if (dist < 1.0 - ring_width) {
      discard;
    }
    // Smooth edge
    let edge_alpha = smoothstep(1.0, 0.95, dist);
    return vec4f(color.rgb, color.a * edge_alpha);
  }
  
  // Filled circle with soft edge
  let edge_alpha = 1.0 - smoothstep(0.8, 1.0, dist);
  return vec4f(color.rgb, color.a * edge_alpha);
}
`;

/**
 * WGSL shader for predator rendering with realistic shapes.
 * Version: 2.0.0 - Enhanced visuals with species-specific shapes and state effects.
 */
const PREDATOR_SHADER = `
struct Uniforms {
  screen_width: f32,
  screen_height: f32,
  time: f32,
  _padding: f32,
}

struct PredatorData {
  position: vec2f,
  heading: f32,
  size: f32,
  color: u32,
  state: f32,      // 0=idle, 1=stalking, 2=hunting, 3=attacking, 4=diving
  intensity: f32,  // Visual intensity 0-1
  stretch: f32,    // Speed-based stretch 1-1.4
  predator_type: f32, // 0=hawk, 1=falcon, 2=eagle, 3=owl, 4=shark, 5=orca, 6=barracuda, 7=sealion
  energy: f32,
  _pad: vec2f,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> predators: array<PredatorData>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
  @location(1) local_uv: vec2f,
}

fn unpack_color(packed: u32) -> vec3f {
  let r = f32((packed >> 16u) & 0xFFu) / 255.0;
  let g = f32((packed >> 8u) & 0xFFu) / 255.0;
  let b = f32(packed & 0xFFu) / 255.0;
  return vec3f(r, g, b);
}

// Bird of prey shape (hawk, falcon, eagle)
fn get_bird_vertex(idx: u32, size: f32, stretch: f32) -> vec2f {
  let body_len = size * 1.8 * stretch;
  let wing_span = size * 1.4;
  let wing_back = size * 0.3;
  
  // 9 vertices for bird shape: beak, head, wing tips, tail
  if (idx == 0u) { return vec2f(body_len, 0.0); }           // Beak tip
  if (idx == 1u) { return vec2f(body_len * 0.6, size * 0.15); }  // Head right
  if (idx == 2u) { return vec2f(body_len * 0.3, wing_span * 0.5); }  // Right wing front
  if (idx == 3u) { return vec2f(-wing_back, wing_span); }    // Right wing tip
  if (idx == 4u) { return vec2f(-body_len * 0.4, size * 0.2); } // Right body
  if (idx == 5u) { return vec2f(-body_len * 0.7, 0.0); }     // Tail
  if (idx == 6u) { return vec2f(-body_len * 0.4, -size * 0.2); } // Left body
  if (idx == 7u) { return vec2f(-wing_back, -wing_span); }   // Left wing tip
  if (idx == 8u) { return vec2f(body_len * 0.3, -wing_span * 0.5); } // Left wing front
  if (idx == 9u) { return vec2f(body_len * 0.6, -size * 0.15); } // Head left
  return vec2f(body_len, 0.0); // Back to beak
}

// Owl shape (rounder, wider)
fn get_owl_vertex(idx: u32, size: f32, stretch: f32) -> vec2f {
  let body_len = size * 1.4 * stretch;
  let width = size * 1.2;
  
  if (idx == 0u) { return vec2f(body_len * 0.8, 0.0); }      // Face center
  if (idx == 1u) { return vec2f(body_len * 0.5, width * 0.4); }
  if (idx == 2u) { return vec2f(0.0, width * 0.7); }         // Right side
  if (idx == 3u) { return vec2f(-body_len * 0.5, width * 0.5); }
  if (idx == 4u) { return vec2f(-body_len * 0.7, width * 0.3); }
  if (idx == 5u) { return vec2f(-body_len * 0.6, 0.0); }     // Tail
  if (idx == 6u) { return vec2f(-body_len * 0.7, -width * 0.3); }
  if (idx == 7u) { return vec2f(-body_len * 0.5, -width * 0.5); }
  if (idx == 8u) { return vec2f(0.0, -width * 0.7); }        // Left side
  if (idx == 9u) { return vec2f(body_len * 0.5, -width * 0.4); }
  return vec2f(body_len * 0.8, 0.0);
}

// Shark shape (sleek, torpedo)
fn get_shark_vertex(idx: u32, size: f32, stretch: f32) -> vec2f {
  let body_len = size * 2.0 * stretch;
  let width = size * 0.6;
  let fin_height = size * 0.8;
  
  if (idx == 0u) { return vec2f(body_len, 0.0); }            // Snout
  if (idx == 1u) { return vec2f(body_len * 0.6, width * 0.3); }
  if (idx == 2u) { return vec2f(body_len * 0.2, width * 0.4); }
  if (idx == 3u) { return vec2f(0.0, fin_height); }          // Dorsal fin tip
  if (idx == 4u) { return vec2f(-body_len * 0.2, width * 0.3); }
  if (idx == 5u) { return vec2f(-body_len * 0.6, width * 0.5); } // Tail upper
  if (idx == 6u) { return vec2f(-body_len * 0.8, 0.0); }     // Tail center
  if (idx == 7u) { return vec2f(-body_len * 0.6, -width * 0.5); } // Tail lower
  if (idx == 8u) { return vec2f(-body_len * 0.2, -width * 0.3); }
  if (idx == 9u) { return vec2f(body_len * 0.2, -width * 0.4); }
  return vec2f(body_len * 0.6, -width * 0.3);
}

// Orca shape (larger, distinctive)
fn get_orca_vertex(idx: u32, size: f32, stretch: f32) -> vec2f {
  let body_len = size * 2.2 * stretch;
  let width = size * 0.8;
  let fin_height = size * 1.2;
  
  if (idx == 0u) { return vec2f(body_len, 0.0); }            // Snout
  if (idx == 1u) { return vec2f(body_len * 0.5, width * 0.4); }
  if (idx == 2u) { return vec2f(body_len * 0.1, width * 0.5); }
  if (idx == 3u) { return vec2f(-body_len * 0.1, fin_height); } // Tall dorsal
  if (idx == 4u) { return vec2f(-body_len * 0.3, width * 0.4); }
  if (idx == 5u) { return vec2f(-body_len * 0.7, width * 0.6); }
  if (idx == 6u) { return vec2f(-body_len * 0.9, 0.0); }     // Tail
  if (idx == 7u) { return vec2f(-body_len * 0.7, -width * 0.6); }
  if (idx == 8u) { return vec2f(-body_len * 0.3, -width * 0.4); }
  if (idx == 9u) { return vec2f(body_len * 0.1, -width * 0.5); }
  return vec2f(body_len * 0.5, -width * 0.4);
}

// Barracuda shape (very elongated)
fn get_barracuda_vertex(idx: u32, size: f32, stretch: f32) -> vec2f {
  let body_len = size * 2.5 * stretch;
  let width = size * 0.35;
  
  if (idx == 0u) { return vec2f(body_len, 0.0); }            // Sharp snout
  if (idx == 1u) { return vec2f(body_len * 0.7, width * 0.3); }
  if (idx == 2u) { return vec2f(body_len * 0.3, width * 0.4); }
  if (idx == 3u) { return vec2f(0.0, width * 0.45); }
  if (idx == 4u) { return vec2f(-body_len * 0.4, width * 0.4); }
  if (idx == 5u) { return vec2f(-body_len * 0.8, width * 0.5); }
  if (idx == 6u) { return vec2f(-body_len * 0.95, 0.0); }    // Tail fork
  if (idx == 7u) { return vec2f(-body_len * 0.8, -width * 0.5); }
  if (idx == 8u) { return vec2f(-body_len * 0.4, -width * 0.4); }
  if (idx == 9u) { return vec2f(0.0, -width * 0.45); }
  return vec2f(body_len * 0.3, -width * 0.4);
}

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_idx: u32,
  @builtin(instance_index) instance_idx: u32
) -> VertexOutput {
  let pred = predators[instance_idx];
  let ptype = u32(pred.predator_type);
  
  // Get shape based on predator type
  var local_pos = vec2f(0.0, 0.0);
  let tri_idx = vertex_idx % 3u;
  let fan_idx = vertex_idx / 3u;
  
  // Fan triangulation from center
  let center = vec2f(0.0, 0.0);
  var v1 = vec2f(0.0, 0.0);
  var v2 = vec2f(0.0, 0.0);
  
  if (ptype == 3u) {
    // Owl
    v1 = get_owl_vertex(fan_idx, pred.size, pred.stretch);
    v2 = get_owl_vertex(fan_idx + 1u, pred.size, pred.stretch);
  } else if (ptype == 4u) {
    // Shark
    v1 = get_shark_vertex(fan_idx, pred.size, pred.stretch);
    v2 = get_shark_vertex(fan_idx + 1u, pred.size, pred.stretch);
  } else if (ptype == 5u) {
    // Orca
    v1 = get_orca_vertex(fan_idx, pred.size, pred.stretch);
    v2 = get_orca_vertex(fan_idx + 1u, pred.size, pred.stretch);
  } else if (ptype == 6u) {
    // Barracuda
    v1 = get_barracuda_vertex(fan_idx, pred.size, pred.stretch);
    v2 = get_barracuda_vertex(fan_idx + 1u, pred.size, pred.stretch);
  } else {
    // Birds (hawk, falcon, eagle, sea-lion uses bird shape)
    v1 = get_bird_vertex(fan_idx, pred.size, pred.stretch);
    v2 = get_bird_vertex(fan_idx + 1u, pred.size, pred.stretch);
  }
  
  if (tri_idx == 0u) { local_pos = center; }
  else if (tri_idx == 1u) { local_pos = v1; }
  else { local_pos = v2; }
  
  // Rotate by heading
  let cos_h = cos(pred.heading);
  let sin_h = sin(pred.heading);
  let rotated = vec2f(
    local_pos.x * cos_h - local_pos.y * sin_h,
    local_pos.x * sin_h + local_pos.y * cos_h
  );
  
  let world_pos = pred.position + rotated;
  let clip_x = (world_pos.x / uniforms.screen_width) * 2.0 - 1.0;
  let clip_y = 1.0 - (world_pos.y / uniforms.screen_height) * 2.0;
  
  // Dynamic color based on state and intensity
  var base_color = unpack_color(pred.color);
  var final_color = base_color;
  
  // State-based color effects
  let intensity = pred.intensity;
  let state = u32(pred.state);
  
  if (state == 1u) {
    // Stalking - slight yellow tint
    final_color = mix(base_color, vec3f(0.9, 0.8, 0.3), intensity * 0.2);
  } else if (state == 2u) {
    // Hunting - orange tint
    final_color = mix(base_color, vec3f(1.0, 0.6, 0.2), intensity * 0.3);
  } else if (state == 3u || state == 4u) {
    // Attacking/Diving - red pulse
    let pulse = sin(uniforms.time * 8.0) * 0.5 + 0.5;
    final_color = mix(base_color, vec3f(1.0, 0.2, 0.1), intensity * 0.5 * pulse + 0.3);
  }
  
  // Energy-based brightness (tired = dimmer)
  let energy_factor = 0.6 + pred.energy * 0.4;
  final_color = final_color * energy_factor;
  
  // Edge glow effect based on intensity
  let edge_glow = intensity * 0.3;
  
  var output: VertexOutput;
  output.position = vec4f(clip_x, clip_y, 0.0, 1.0);
  output.color = vec4f(final_color + edge_glow, 1.0);
  output.local_uv = local_pos / pred.size;
  return output;
}

@fragment
fn fs_main(
  @location(0) color: vec4f,
  @location(1) local_uv: vec2f
) -> @location(0) vec4f {
  // Slight gradient from center to edge
  let dist = length(local_uv);
  let edge_fade = 1.0 - smoothstep(0.8, 1.2, dist) * 0.2;
  return vec4f(color.rgb * edge_fade, color.a);
}
`;

/**
 * WGSL shader for wind indicator arrow.
 */
const WIND_SHADER = `
struct Uniforms {
  screen_width: f32,
  screen_height: f32,
  wind_direction: f32, // radians
  wind_speed: f32,
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@vertex
fn vs_main(@builtin(vertex_index) vertex_idx: u32) -> VertexOutput {
  // Wind indicator position (top-left corner)
  let center = vec2f(60.0, 60.0);
  let arrow_len = 30.0 * min(uniforms.wind_speed / 2.0, 1.0);
  
  // Arrow vertices - initialized with default
  var local_pos = vec2f(0.0, 0.0);
  // Arrow body (line as thin triangle)
  if (vertex_idx == 0u) {
    local_pos = vec2f(0.0, -1.0);
  } else if (vertex_idx == 1u) {
    local_pos = vec2f(arrow_len, 0.0);
  } else if (vertex_idx == 2u) {
    local_pos = vec2f(0.0, 1.0);
  // Arrowhead
  } else if (vertex_idx == 3u) {
    local_pos = vec2f(arrow_len - 8.0, -5.0);
  } else if (vertex_idx == 4u) {
    local_pos = vec2f(arrow_len, 0.0);
  } else if (vertex_idx == 5u) {
    local_pos = vec2f(arrow_len - 8.0, 5.0);
  }
  
  // Rotate by wind direction
  let cos_d = cos(uniforms.wind_direction);
  let sin_d = sin(uniforms.wind_direction);
  let rotated = vec2f(
    local_pos.x * cos_d - local_pos.y * sin_d,
    local_pos.x * sin_d + local_pos.y * cos_d
  );
  
  let world_pos = center + rotated;
  let clip_x = (world_pos.x / uniforms.screen_width) * 2.0 - 1.0;
  let clip_y = 1.0 - (world_pos.y / uniforms.screen_height) * 2.0;
  
  var output: VertexOutput;
  output.position = vec4f(clip_x, clip_y, 0.0, 1.0);
  output.color = vec4f(0.0, 1.0, 0.53, 0.8); // Green color
  return output;
}

@fragment
fn fs_main(@location(0) color: vec4f) -> @location(0) vec4f {
  return color;
}
`;

const MAX_INSTANCES = 100;
const MAX_PREDATORS = 10;

/**
 * Renders environment elements using flux-gpu.
 * Version: 1.0.0
 */
export class EnvironmentRenderer {
  private flux: Flux;
  private worldWidth: number;
  private worldHeight: number;

  // Pipelines
  private envPipeline: GPURenderPipeline | null = null;
  private predatorPipeline: GPURenderPipeline | null = null;
  private windPipeline: GPURenderPipeline | null = null;

  // Buffers
  private envUniformBuffer: GPUBuffer | null = null;
  private envInstanceBuffer: GPUBuffer | null = null;
  private predatorUniformBuffer: GPUBuffer | null = null;
  private predatorBuffer: GPUBuffer | null = null;
  private windUniformBuffer: GPUBuffer | null = null;

  // Bind groups
  private envBindGroup: GPUBindGroup | null = null;
  private predatorBindGroup: GPUBindGroup | null = null;
  private windBindGroup: GPUBindGroup | null = null;

  // CPU staging
  private envInstanceData: Float32Array;
  private predatorData: Float32Array;

  // State
  private showWind: boolean = true;

  constructor(flux: Flux, worldWidth: number, worldHeight: number) {
    console.log('EnvironmentRenderer v1.1.0 initialized');
    this.flux = flux;
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;

    // Allocate CPU buffers
    // InstanceData: pos(2) + radius(1) + color(1) + alpha(1) + style(1) + pad(2) = 8 floats
    this.envInstanceData = new Float32Array(MAX_INSTANCES * 8);
    // PredatorData: pos(2) + heading(1) + size(1) + color(1) + state(1) + intensity(1) + stretch(1) + type(1) + energy(1) + pad(2) = 12 floats
    this.predatorData = new Float32Array(MAX_PREDATORS * 12);

    this.initGPUResources();
  }

  private initGPUResources(): void {
    const device = this.flux.device;

    // === Environment circles pipeline ===
    const envShader = this.flux.shader(ENV_SHADER, 'env-shader');

    this.envUniformBuffer = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'env-uniforms',
    });

    this.envInstanceBuffer = device.createBuffer({
      size: MAX_INSTANCES * 32, // 8 floats * 4 bytes
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      label: 'env-instances',
    });

    const envBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      ],
    });

    this.envBindGroup = device.createBindGroup({
      layout: envBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.envUniformBuffer } },
        { binding: 1, resource: { buffer: this.envInstanceBuffer } },
      ],
    });

    this.envPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [envBindGroupLayout] }),
      vertex: { module: envShader, entryPoint: 'vs_main' },
      fragment: {
        module: envShader,
        entryPoint: 'fs_main',
        targets: [{
          format: this.flux.preferredFormat,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          },
        }],
      },
      primitive: { topology: 'triangle-list' },
    });

    // === Predator pipeline ===
    const predatorShader = this.flux.shader(PREDATOR_SHADER, 'predator-shader');

    this.predatorUniformBuffer = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'predator-uniforms',
    });

    this.predatorBuffer = device.createBuffer({
      size: MAX_PREDATORS * 48, // 12 floats * 4 bytes
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      label: 'predator-data',
    });

    const predatorBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      ],
    });

    this.predatorBindGroup = device.createBindGroup({
      layout: predatorBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.predatorUniformBuffer } },
        { binding: 1, resource: { buffer: this.predatorBuffer } },
      ],
    });

    this.predatorPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [predatorBindGroupLayout] }),
      vertex: { module: predatorShader, entryPoint: 'vs_main' },
      fragment: {
        module: predatorShader,
        entryPoint: 'fs_main',
        targets: [{
          format: this.flux.preferredFormat,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          },
        }],
      },
      primitive: { topology: 'triangle-list' },
    });

    // === Wind indicator pipeline ===
    const windShader = this.flux.shader(WIND_SHADER, 'wind-shader');

    this.windUniformBuffer = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'wind-uniforms',
    });

    const windBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
      ],
    });

    this.windBindGroup = device.createBindGroup({
      layout: windBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.windUniformBuffer } },
      ],
    });

    this.windPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [windBindGroupLayout] }),
      vertex: { module: windShader, entryPoint: 'vs_main' },
      fragment: {
        module: windShader,
        entryPoint: 'fs_main',
        targets: [{
          format: this.flux.preferredFormat,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          },
        }],
      },
      primitive: { topology: 'triangle-list' },
    });
  }

  /**
   * Render wind indicator.
   */
  renderWind(
    renderPass: GPURenderPassEncoder,
    direction: number,
    speed: number,
    enabled: boolean
  ): void {
    if (!enabled || !this.showWind || !this.windPipeline || !this.windBindGroup || !this.windUniformBuffer) {
      return;
    }

    const dirRad = (direction * Math.PI) / 180;
    const uniformData = new Float32Array([
      this.worldWidth,
      this.worldHeight,
      dirRad,
      speed,
    ]);
    this.flux.device.queue.writeBuffer(this.windUniformBuffer, 0, uniformData);

    renderPass.setPipeline(this.windPipeline);
    renderPass.setBindGroup(0, this.windBindGroup);
    renderPass.draw(6); // Arrow body + head
  }

  /**
   * Get predator type index for shader.
   */
  private getPredatorTypeIndex(type: string): number {
    const typeMap: Record<string, number> = {
      'hawk': 0,
      'falcon': 1,
      'eagle': 2,
      'owl': 3,
      'shark': 4,
      'orca': 5,
      'barracuda': 6,
      'sea-lion': 7
    };
    return typeMap[type] ?? 0;
  }

  /**
   * Map predator state to shader state value.
   */
  private getPredatorStateValue(state: string): number {
    switch (state) {
      case 'idle':
      case 'recovering':
        return 0;
      case 'scanning':
      case 'stalking':
      case 'ambushing':
      case 'circling':
        return 1;
      case 'hunting':
      case 'herding':
      case 'ascending':
        return 2;
      case 'attacking':
        return 3;
      case 'diving':
        return 4;
      default:
        return 0;
    }
  }

  /**
   * Render predators with realistic shapes and visual effects.
   */
  renderPredators(
    renderPass: GPURenderPassEncoder,
    predators: BasePredator[]
  ): void {
    if (predators.length === 0 || !this.predatorPipeline || !this.predatorBindGroup) {
      return;
    }

    const count = Math.min(predators.length, MAX_PREDATORS);

    // Pack predator data (12 floats per predator)
    for (let i = 0; i < count; i++) {
      const pred = predators[i];
      const offset = i * 12;
      
      // Position
      this.predatorData[offset] = pred.position.x;
      this.predatorData[offset + 1] = pred.position.y;
      
      // Use smoothed heading for natural rotation
      this.predatorData[offset + 2] = pred.getSmoothedHeading();
      
      // Size based on panic radius (larger predators have larger panic radius)
      this.predatorData[offset + 3] = Math.min(pred.getBasePanicRadius() / 8, 20);
      
      // Store color as u32 bits
      const colorView = new DataView(this.predatorData.buffer);
      colorView.setUint32((offset + 4) * 4, pred.getColor(), true);
      
      // State value for shader effects
      this.predatorData[offset + 5] = this.getPredatorStateValue(pred.state);
      
      // Visual intensity (0-1) for glow/pulse effects
      this.predatorData[offset + 6] = pred.getVisualIntensity();
      
      // Speed stretch for elongation at high speeds
      this.predatorData[offset + 7] = pred.getSpeedStretch();
      
      // Predator type for shape selection
      this.predatorData[offset + 8] = this.getPredatorTypeIndex(pred.type);
      
      // Energy level for brightness
      this.predatorData[offset + 9] = pred.energy;
      
      // Padding
      this.predatorData[offset + 10] = 0;
      this.predatorData[offset + 11] = 0;
    }

    // Upload uniforms
    const uniformData = new Float32Array([
      this.worldWidth,
      this.worldHeight,
      performance.now() / 1000,
      0,
    ]);
    this.flux.device.queue.writeBuffer(this.predatorUniformBuffer!, 0, uniformData);
    this.flux.device.queue.writeBuffer(this.predatorBuffer!, 0, this.predatorData.buffer, 0, count * 48);

    renderPass.setPipeline(this.predatorPipeline);
    renderPass.setBindGroup(0, this.predatorBindGroup);
    
    // Draw 10 triangles (fan) per predator = 30 vertices
    renderPass.draw(30, count);
  }

  /**
   * Render food sources.
   */
  renderFood(
    renderPass: GPURenderPassEncoder,
    foodSources: IFoodSource[]
  ): void {
    if (foodSources.length === 0 || !this.envPipeline || !this.envBindGroup) {
      return;
    }

    let instanceCount = 0;

    for (const food of foodSources) {
      if (instanceCount >= MAX_INSTANCES) break;

      const x = (food.position as any).x;
      const y = (food.position as any).y;

      if (food.consumed) {
        // Depleted food - small grey circle
        const offset = instanceCount * 8;
        this.envInstanceData[offset] = x;
        this.envInstanceData[offset + 1] = y;
        this.envInstanceData[offset + 2] = food.radius * 0.3;
        const colorView = new DataView(this.envInstanceData.buffer);
        colorView.setUint32((offset + 3) * 4, 0x444444, true);
        this.envInstanceData[offset + 4] = 0.3;
        this.envInstanceData[offset + 5] = 0; // filled
        instanceCount++;
      } else {
        // Active food - outer ring
        let offset = instanceCount * 8;
        this.envInstanceData[offset] = x;
        this.envInstanceData[offset + 1] = y;
        this.envInstanceData[offset + 2] = food.radius;
        let colorView = new DataView(this.envInstanceData.buffer);
        colorView.setUint32((offset + 3) * 4, 0x44ff44, true);
        this.envInstanceData[offset + 4] = 0.2;
        this.envInstanceData[offset + 5] = 1; // ring
        instanceCount++;

        if (instanceCount >= MAX_INSTANCES) break;

        // Inner filled circle based on amount
        const fillPercent = food.amount / food.maxAmount;
        offset = instanceCount * 8;
        this.envInstanceData[offset] = x;
        this.envInstanceData[offset + 1] = y;
        this.envInstanceData[offset + 2] = food.radius * 0.4 * fillPercent + 5;
        colorView = new DataView(this.envInstanceData.buffer);
        colorView.setUint32((offset + 3) * 4, 0x44ff44, true);
        this.envInstanceData[offset + 4] = 0.6;
        this.envInstanceData[offset + 5] = 0; // filled
        instanceCount++;
      }
    }

    if (instanceCount === 0) return;

    // Upload data
    const uniformData = new Float32Array([
      this.worldWidth,
      this.worldHeight,
      performance.now() / 1000,
      0,
    ]);
    this.flux.device.queue.writeBuffer(this.envUniformBuffer!, 0, uniformData);
    this.flux.device.queue.writeBuffer(this.envInstanceBuffer!, 0, this.envInstanceData.buffer, 0, instanceCount * 32);

    renderPass.setPipeline(this.envPipeline);
    renderPass.setBindGroup(0, this.envBindGroup);
    renderPass.draw(6, instanceCount);
  }

  /**
   * Render attractors/repulsors.
   */
  renderAttractors(
    renderPass: GPURenderPassEncoder,
    attractors: IAttractor[]
  ): void {
    if (attractors.length === 0 || !this.envPipeline || !this.envBindGroup) {
      return;
    }

    let instanceCount = 0;
    const time = performance.now() / 1000;

    for (const attractor of attractors) {
      if (instanceCount >= MAX_INSTANCES - 1) break;

      const alpha = Math.min(attractor.lifetime / 3, 1) * 0.6;
      const pulseScale = 0.8 + Math.sin(time * Math.PI * 2) * 0.2;

      // Outer pulsing ring
      let offset = instanceCount * 8;
      this.envInstanceData[offset] = attractor.x;
      this.envInstanceData[offset + 1] = attractor.y;
      this.envInstanceData[offset + 2] = attractor.radius * pulseScale;
      let colorView = new DataView(this.envInstanceData.buffer);
      const color = attractor.isRepulsor ? 0xff4444 : 0x4488ff;
      colorView.setUint32((offset + 3) * 4, color, true);
      this.envInstanceData[offset + 4] = alpha;
      this.envInstanceData[offset + 5] = 1; // ring
      instanceCount++;

      // Inner glow
      offset = instanceCount * 8;
      this.envInstanceData[offset] = attractor.x;
      this.envInstanceData[offset + 1] = attractor.y;
      this.envInstanceData[offset + 2] = attractor.radius * 0.5;
      colorView = new DataView(this.envInstanceData.buffer);
      colorView.setUint32((offset + 3) * 4, color, true);
      this.envInstanceData[offset + 4] = 0.2;
      this.envInstanceData[offset + 5] = 0; // filled
      instanceCount++;
    }

    if (instanceCount === 0) return;

    // Upload data
    const uniformData = new Float32Array([
      this.worldWidth,
      this.worldHeight,
      time,
      0,
    ]);
    this.flux.device.queue.writeBuffer(this.envUniformBuffer!, 0, uniformData);
    this.flux.device.queue.writeBuffer(this.envInstanceBuffer!, 0, this.envInstanceData.buffer, 0, instanceCount * 32);

    renderPass.setPipeline(this.envPipeline);
    renderPass.setBindGroup(0, this.envBindGroup);
    renderPass.draw(6, instanceCount);
  }

  /**
   * Resize handler.
   */
  resize(width: number, height: number): void {
    this.worldWidth = width;
    this.worldHeight = height;
  }

  /**
   * Toggle wind indicator visibility.
   */
  setWindVisible(visible: boolean): void {
    this.showWind = visible;
  }

  /**
   * Clean up resources.
   */
  destroy(): void {
    this.envUniformBuffer?.destroy();
    this.envInstanceBuffer?.destroy();
    this.predatorUniformBuffer?.destroy();
    this.predatorBuffer?.destroy();
    this.windUniformBuffer?.destroy();
  }
}
