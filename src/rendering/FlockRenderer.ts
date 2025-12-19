import type { Flux, FluxRenderPipeline } from '@flux-gpu/core';
import { lerpColor, clamp } from '../utils/MathUtils';
import type { IRenderingConfig } from '../types';
import type { BirdArrays } from '../simulation/Bird';

// Version: 2.1.0 - Fixed WGSL shader for WebGPU compatibility

/**
 * WGSL shader for instanced bird rendering with firefly glow support.
 * Birds are rendered as triangular shapes with rotation based on heading.
 * In firefly mode, birds have a glowing halo effect based on glow intensity.
 */
const BIRD_SHADER = `
struct Uniforms {
  screen_width: f32,
  screen_height: f32,
  particle_size: f32,
  time: f32,
  glow_enabled: f32,
  glow_intensity_mult: f32,
  padding1: f32,
  padding2: f32,
}

struct BirdData {
  position: vec2f,
  heading: f32,
  color: u32,
  glow_intensity: f32,
  padding1: f32,
  padding2: f32,
  padding3: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> birds: array<BirdData>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
  @location(1) glow_factor: f32,
}

// Unpack RGBA color from u32
fn unpack_color(packed: u32) -> vec4f {
  let r = f32((packed >> 16u) & 0xFFu) / 255.0;
  let g = f32((packed >> 8u) & 0xFFu) / 255.0;
  let b = f32(packed & 0xFFu) / 255.0;
  return vec4f(r, g, b, 1.0);
}

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_idx: u32,
  @builtin(instance_index) instance_idx: u32
) -> VertexOutput {
  let bird = birds[instance_idx];
  
  // Scale size based on glow intensity for pulsing effect
  let glow_scale = 1.0 + bird.glow_intensity * uniforms.glow_enabled * 0.3;
  let size = uniforms.particle_size * 4.0 * glow_scale;
  
  // Arrow shape vertices (pointing right at heading=0)
  // Initialize with default values
  var local_pos = vec2f(0.0, 0.0);
  
  // Triangle vertices for arrow shape using if-else (more compatible than switch)
  if (vertex_idx == 0u) {
    local_pos = vec2f(size, 0.0);  // tip
  } else if (vertex_idx == 1u) {
    local_pos = vec2f(-size * 0.5, size * 0.4);  // top-left
  } else if (vertex_idx == 2u) {
    local_pos = vec2f(-size * 0.5, -size * 0.4);  // bottom-left
  }
  
  // Rotate by heading
  let cos_h = cos(bird.heading);
  let sin_h = sin(bird.heading);
  let rotated = vec2f(
    local_pos.x * cos_h - local_pos.y * sin_h,
    local_pos.x * sin_h + local_pos.y * cos_h
  );
  
  // World position
  let world_pos = bird.position + rotated;
  
  // Convert to clip space (-1 to 1)
  let clip_x = (world_pos.x / uniforms.screen_width) * 2.0 - 1.0;
  let clip_y = 1.0 - (world_pos.y / uniforms.screen_height) * 2.0;
  
  var output: VertexOutput;
  output.position = vec4f(clip_x, clip_y, 0.0, 1.0);
  output.color = unpack_color(bird.color);
  output.glow_factor = bird.glow_intensity * uniforms.glow_enabled * uniforms.glow_intensity_mult;
  return output;
}

@fragment
fn fs_main(
  @location(0) color: vec4f,
  @location(1) glow_factor: f32
) -> @location(0) vec4f {
  // Base color
  var final_color = color;
  
  // Apply glow effect: brighten the color based on glow factor
  // This creates a luminous effect when fireflies flash
  if (glow_factor > 0.01) {
    // Boost brightness for glow
    let glow_boost = 1.0 + glow_factor * 2.0;
    final_color = vec4f(
      min(1.0, color.r * glow_boost),
      min(1.0, color.g * glow_boost),
      min(1.0, color.b * glow_boost),
      color.a
    );
    
    // Add a slight additive glow (HDR-like effect)
    let additive = glow_factor * 0.3;
    final_color = vec4f(
      min(1.0, final_color.r + additive),
      min(1.0, final_color.g + additive * 0.8),
      min(1.0, final_color.b + additive * 0.2),
      final_color.a
    );
  }
  
  return final_color;
}
`;

/**
 * Renders the flock using flux-gpu with GPU instancing.
 * Version: 2.0.0 - Added firefly glow support
 */
export class FlockRenderer {
  private flux: Flux;
  private config: IRenderingConfig;
  private maxBirds: number;

  // GPU resources
  private pipeline: FluxRenderPipeline | null = null;
  private uniformBuffer: GPUBuffer | null = null;
  private birdDataBuffer: GPUBuffer | null = null;
  private bindGroup: GPUBindGroup | null = null;
  private shader: GPUShaderModule | null = null;

  // CPU staging buffer for bird data
  // BirdData: position (2) + heading (1) + color (1) + glow_intensity (1) + padding (3) = 8 floats per bird
  private birdDataCPU: Float32Array;
  private colorCache: Uint32Array;
  private glowCache: Float32Array;

  constructor(flux: Flux, config: IRenderingConfig, maxBirds: number) {
    console.log('FlockRenderer v2.1.0 initialized (firefly glow support)');
    this.flux = flux;
    this.config = config;
    this.maxBirds = maxBirds;

    // Allocate CPU buffers
    // BirdData: position (2) + heading (1) + color (1) + glow_intensity (1) + padding (3) = 8 floats per bird
    this.birdDataCPU = new Float32Array(maxBirds * 8);
    this.colorCache = new Uint32Array(maxBirds);
    this.glowCache = new Float32Array(maxBirds);

    this.initGPUResources();
  }

  /**
   * Initialize GPU resources.
   */
  private initGPUResources(): void {
    const device = this.flux.device;

    // Create shader module
    this.shader = this.flux.shader(BIRD_SHADER, 'bird-shader');

    // Create uniform buffer (screen dimensions + particle size + time + glow settings + padding)
    this.uniformBuffer = device.createBuffer({
      size: 32, // 8 floats (width, height, size, time, glow_enabled, glow_mult, pad, pad)
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'flock-uniforms',
    });

    // Create bird data storage buffer
    // BirdData: position (2) + heading (1) + color (1) + glow_intensity (1) + padding (3) = 8 floats
    this.birdDataBuffer = device.createBuffer({
      size: this.maxBirds * 32, // 8 floats per bird = 32 bytes
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      label: 'bird-data',
    });

    // Create bind group layout
    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'uniform' },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'read-only-storage' },
        },
      ],
    });

    // Create bind group
    this.bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: { buffer: this.birdDataBuffer } },
      ],
    });

    // Create pipeline layout
    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    });

    // Create render pipeline
    const pipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: this.shader,
        entryPoint: 'vs_main',
      },
      fragment: {
        module: this.shader,
        entryPoint: 'fs_main',
        targets: [
          {
            format: this.flux.preferredFormat,
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
          },
        ],
      },
      primitive: {
        topology: 'triangle-list',
      },
    });

    this.pipeline = pipeline as unknown as FluxRenderPipeline;
  }

  /**
   * Update rendering configuration.
   */
  updateConfig(config: IRenderingConfig): void {
    this.config = config;
  }

  /**
   * Calculate tint colors based on color mode.
   */
  private calculateTints(birdArrays: BirdArrays): void {
    const count = birdArrays.count;
    const mode = this.config.colorMode;

    switch (mode) {
      case 'solid':
        for (let i = 0; i < count; i++) {
          this.colorCache[i] = this.config.particleColor;
        }
        break;

      case 'density':
        for (let i = 0; i < count; i++) {
          const density = clamp(birdArrays.localDensity[i], 0, 1);
          this.colorCache[i] = lerpColor(
            this.config.lowDensityColor,
            this.config.highDensityColor,
            density
          );
        }
        break;

      case 'speed':
        for (let i = 0; i < count; i++) {
          const speed = Math.sqrt(
            birdArrays.velocityX[i] ** 2 +
            birdArrays.velocityY[i] ** 2
          );
          const t = clamp(speed / 20, 0, 1);
          this.colorCache[i] = lerpColor(
            this.config.slowColor,
            this.config.fastColor,
            t
          );
        }
        break;

      case 'panic':
        for (let i = 0; i < count; i++) {
          const panic = clamp(birdArrays.panicLevel[i], 0, 1);
          this.colorCache[i] = lerpColor(
            this.config.calmColor,
            this.config.panicColor,
            panic
          );
        }
        break;

      case 'gender':
        for (let i = 0; i < count; i++) {
          this.colorCache[i] = birdArrays.gender[i] === 1
            ? this.config.maleColor
            : this.config.femaleColor;
        }
        break;

      case 'mating':
        for (let i = 0; i < count; i++) {
          const matingState = birdArrays.matingState[i];
          if (matingState > 0 && matingState < 5) {
            this.colorCache[i] = 0xff00ff;
          } else if (matingState === 5) {
            this.colorCache[i] = 0xff0000;
          } else {
            this.colorCache[i] = birdArrays.gender[i] === 1
              ? this.config.maleColor
              : this.config.femaleColor;
          }
        }
        break;

      case 'firefly':
        // Firefly mode: lerp between dim and glow colors based on glow intensity
        for (let i = 0; i < count; i++) {
          const intensity = clamp(birdArrays.glowIntensity[i], 0, 1);
          this.colorCache[i] = lerpColor(
            this.config.fireflyDimColor ?? 0x3d2814,
            this.config.fireflyGlowColor ?? 0xf7dc6f,
            intensity
          );
          this.glowCache[i] = intensity;
        }
        break;

      default:
        for (let i = 0; i < count; i++) {
          this.colorCache[i] = this.config.particleColor;
        }
    }
    
    // Store glow intensity for all modes (used in shader)
    if (mode !== 'firefly') {
      // If glow is enabled without firefly mode, use a constant intensity
      // This makes the glow effect visible even without firefly synchronization
      const useConstantGlow = this.config.glowEnabled;
      const constantIntensity = this.config.glowIntensity ?? 0.5;
      
      for (let i = 0; i < count; i++) {
        this.glowCache[i] = useConstantGlow ? constantIntensity : birdArrays.glowIntensity[i];
      }
    }
  }

  /**
   * Upload bird data to GPU and render.
   */
  render(
    renderPass: GPURenderPassEncoder,
    birdArrays: BirdArrays,
    screenWidth: number,
    screenHeight: number
  ): void {
    if (!this.pipeline || !this.bindGroup || !this.uniformBuffer || !this.birdDataBuffer) {
      return;
    }

    const count = birdArrays.count;
    if (count === 0) return;

    // Calculate colors and glow
    this.calculateTints(birdArrays);

    // Pack bird data: [posX, posY, heading, color(as bits), glow_intensity, padding x3]
    const colorView = new DataView(this.birdDataCPU.buffer);
    for (let i = 0; i < count; i++) {
      const offset = i * 8;
      this.birdDataCPU[offset] = birdArrays.positionX[i];
      this.birdDataCPU[offset + 1] = birdArrays.positionY[i];
      this.birdDataCPU[offset + 2] = birdArrays.heading[i];
      // Store color as u32 bits in f32
      colorView.setUint32((offset + 3) * 4, this.colorCache[i], true);
      // Glow intensity
      this.birdDataCPU[offset + 4] = this.glowCache[i];
      // Padding
      this.birdDataCPU[offset + 5] = 0;
      this.birdDataCPU[offset + 6] = 0;
      this.birdDataCPU[offset + 7] = 0;
    }

    // Determine if glow should be enabled
    const glowEnabled = this.config.colorMode === 'firefly' || this.config.glowEnabled;
    
    // Upload uniforms
    const uniformData = new Float32Array([
      screenWidth,
      screenHeight,
      this.config.particleSize,
      performance.now() / 1000,
      glowEnabled ? 1.0 : 0.0,           // glow_enabled
      this.config.glowIntensity ?? 1.0,  // glow_intensity_mult
      0.0,                                // padding1
      0.0,                                // padding2
    ]);
    this.flux.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);

    // Upload bird data
    this.flux.device.queue.writeBuffer(
      this.birdDataBuffer,
      0,
      this.birdDataCPU.buffer,
      0,
      count * 32  // 8 floats per bird = 32 bytes
    );

    // Render
    renderPass.setPipeline(this.pipeline as unknown as GPURenderPipeline);
    renderPass.setBindGroup(0, this.bindGroup);
    renderPass.draw(3, count); // 3 vertices per triangle, count instances
  }

  /**
   * Clean up resources.
   */
  destroy(): void {
    this.uniformBuffer?.destroy();
    this.birdDataBuffer?.destroy();
  }
}
