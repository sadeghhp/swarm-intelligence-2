import type { Flux } from '@flux-gpu/core';
import type { BirdArrays } from '../simulation/Bird';

// Version: 1.0.0 - Firefly glow halo effect

/**
 * WGSL shader for rendering glowing halos behind fireflies.
 * Each firefly gets a soft, radial gradient circle that pulses with glow intensity.
 */
const GLOW_SHADER = `
struct Uniforms {
  screen_width: f32,
  screen_height: f32,
  base_radius: f32,
  time: f32,
}

struct GlowData {
  position: vec2f,
  intensity: f32,
  color_packed: u32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> glows: array<GlowData>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) intensity: f32,
  @location(2) color: vec3f,
}

// Unpack RGB color from u32
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
  let glow = glows[instance_idx];
  
  // Skip if intensity is very low
  if (glow.intensity < 0.1) {
    var output: VertexOutput;
    output.position = vec4f(-10.0, -10.0, 0.0, 1.0);
    output.uv = vec2f(0.0, 0.0);
    output.intensity = 0.0;
    output.color = vec3f(0.0, 0.0, 0.0);
    return output;
  }
  
  // Glow radius - subtle scaling with intensity
  let radius = uniforms.base_radius * (0.8 + glow.intensity * 0.4);
  
  // Quad vertices (2 triangles = 6 vertices)
  var local_pos = vec2f(0.0, 0.0);
  var uv = vec2f(0.0, 0.0);
  
  if (vertex_idx == 0u) {
    local_pos = vec2f(-radius, -radius);
    uv = vec2f(-1.0, -1.0);
  } else if (vertex_idx == 1u) {
    local_pos = vec2f(radius, -radius);
    uv = vec2f(1.0, -1.0);
  } else if (vertex_idx == 2u) {
    local_pos = vec2f(-radius, radius);
    uv = vec2f(-1.0, 1.0);
  } else if (vertex_idx == 3u) {
    local_pos = vec2f(radius, -radius);
    uv = vec2f(1.0, -1.0);
  } else if (vertex_idx == 4u) {
    local_pos = vec2f(radius, radius);
    uv = vec2f(1.0, 1.0);
  } else if (vertex_idx == 5u) {
    local_pos = vec2f(-radius, radius);
    uv = vec2f(-1.0, 1.0);
  }
  
  // World position
  let world_pos = glow.position + local_pos;
  
  // Convert to clip space
  let clip_x = (world_pos.x / uniforms.screen_width) * 2.0 - 1.0;
  let clip_y = 1.0 - (world_pos.y / uniforms.screen_height) * 2.0;
  
  var output: VertexOutput;
  output.position = vec4f(clip_x, clip_y, 0.0, 1.0);
  output.uv = uv;
  output.intensity = glow.intensity;
  output.color = unpack_color(glow.color_packed);
  return output;
}

@fragment
fn fs_main(
  @location(0) uv: vec2f,
  @location(1) intensity: f32,
  @location(2) color: vec3f
) -> @location(0) vec4f {
  // Distance from center
  let dist = length(uv);
  
  // Discard pixels outside the circle
  if (dist > 1.0) {
    discard;
  }
  
  // Soft circular gradient with exponential falloff
  // Creates a nice soft glow that fades quickly at edges
  let falloff = exp(-dist * dist * 3.0);
  
  // Alpha based on intensity and falloff - much more subtle
  let alpha = falloff * intensity * 0.35;
  
  // Subtle color - don't over-brighten
  let glow_color = color * (0.8 + intensity * 0.4);
  
  return vec4f(glow_color, alpha);
}
`;

const MAX_GLOWS = 10000;

/**
 * Renders glowing halos behind fireflies.
 * Creates a soft, radial gradient effect that pulses with glow intensity.
 */
export class GlowEffect {
  private flux: Flux;
  private enabled: boolean = true;
  private baseRadius: number = 20;
  
  // GPU resources
  private pipeline: GPURenderPipeline | null = null;
  private uniformBuffer: GPUBuffer | null = null;
  private glowBuffer: GPUBuffer | null = null;
  private bindGroup: GPUBindGroup | null = null;
  
  // CPU staging buffer
  // GlowData: position (2) + intensity (1) + color (1) = 4 floats per glow
  private glowDataCPU: Float32Array;
  
  constructor(flux: Flux, maxCount: number = MAX_GLOWS, baseRadius: number = 20) {
    console.log('GlowEffect v1.0.0 initialized');
    this.flux = flux;
    this.baseRadius = baseRadius;
    
    // 4 floats per glow
    this.glowDataCPU = new Float32Array(Math.min(maxCount, MAX_GLOWS) * 4);
    
    this.initGPUResources();
  }
  
  private initGPUResources(): void {
    const device = this.flux.device;
    
    const shader = this.flux.shader(GLOW_SHADER, 'glow-shader');
    
    // Uniform buffer
    this.uniformBuffer = device.createBuffer({
      size: 16, // 4 floats
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'glow-uniforms',
    });
    
    // Glow data storage buffer
    this.glowBuffer = device.createBuffer({
      size: MAX_GLOWS * 16, // 4 floats * 4 bytes
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      label: 'glow-data',
    });
    
    // Bind group layout
    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      ],
    });
    
    // Bind group
    this.bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: { buffer: this.glowBuffer } },
      ],
    });
    
    // Render pipeline with soft additive blending for subtle glow
    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
      vertex: { module: shader, entryPoint: 'vs_main' },
      fragment: {
        module: shader,
        entryPoint: 'fs_main',
        targets: [{
          format: this.flux.preferredFormat,
          blend: {
            // Soft additive blending - adds glow without washing out to white
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          },
        }],
      },
      primitive: { topology: 'triangle-list' },
    });
  }
  
  /**
   * Enable/disable glow effect.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
  
  /**
   * Set base radius for glow halos.
   */
  setBaseRadius(radius: number): void {
    this.baseRadius = radius;
  }
  
  /**
   * Render glow halos.
   */
  render(
    renderPass: GPURenderPassEncoder,
    birdArrays: BirdArrays,
    screenWidth: number,
    screenHeight: number,
    glowColor: number = 0xffcc00
  ): void {
    if (!this.enabled || !this.pipeline || !this.bindGroup) {
      return;
    }
    
    const count = Math.min(birdArrays.count, MAX_GLOWS);
    if (count === 0) return;
    
    // Pack glow data
    const colorView = new DataView(this.glowDataCPU.buffer);
    let activeCount = 0;
    
    for (let i = 0; i < count; i++) {
      const intensity = birdArrays.glowIntensity[i];
      
      // Only render glows for fireflies with significant intensity (above 20%)
      if (intensity > 0.2) {
        const offset = activeCount * 4;
        this.glowDataCPU[offset] = birdArrays.positionX[i];
        this.glowDataCPU[offset + 1] = birdArrays.positionY[i];
        // Square the intensity for more dramatic on/off effect
        this.glowDataCPU[offset + 2] = intensity * intensity;
        colorView.setUint32((offset + 3) * 4, glowColor, true);
        activeCount++;
      }
    }
    
    if (activeCount === 0) return;
    
    // Upload uniforms
    const uniformData = new Float32Array([
      screenWidth,
      screenHeight,
      this.baseRadius,
      performance.now() / 1000,
    ]);
    this.flux.device.queue.writeBuffer(this.uniformBuffer!, 0, uniformData);
    
    // Upload glow data
    this.flux.device.queue.writeBuffer(
      this.glowBuffer!,
      0,
      this.glowDataCPU.buffer,
      0,
      activeCount * 16
    );
    
    // Render
    renderPass.setPipeline(this.pipeline);
    renderPass.setBindGroup(0, this.bindGroup);
    renderPass.draw(6, activeCount); // 6 vertices per quad, activeCount instances
  }
  
  /**
   * Clean up resources.
   */
  destroy(): void {
    this.uniformBuffer?.destroy();
    this.glowBuffer?.destroy();
  }
}
