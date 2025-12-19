import type { Flux } from '@flux-gpu/core';
import type { BirdArrays } from '../simulation/Bird';

// Version: 1.1.0 - Fixed WGSL shader compatibility

/**
 * WGSL shader for rendering bird trails as line segments.
 */
const TRAIL_SHADER = `
struct Uniforms {
  screen_width: f32,
  screen_height: f32,
  trail_color_r: f32,
  trail_color_g: f32,
  trail_color_b: f32,
  max_trail_length: f32,
  _pad: vec2f,
}

struct TrailSegment {
  start_pos: vec2f,
  end_pos: vec2f,
  alpha: f32,
  width: f32,
  _pad: vec2f,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> segments: array<TrailSegment>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) alpha: f32,
}

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_idx: u32,
  @builtin(instance_index) instance_idx: u32
) -> VertexOutput {
  let seg = segments[instance_idx];
  
  // Line direction
  let dir = seg.end_pos - seg.start_pos;
  let len = length(dir);
  
  if (len < 0.001) {
    var output: VertexOutput;
    output.position = vec4f(-2.0, -2.0, 0.0, 1.0); // Off screen
    output.alpha = 0.0;
    return output;
  }
  
  let norm_dir = dir / len;
  let perp = vec2f(-norm_dir.y, norm_dir.x) * seg.width;
  
  // Quad vertices for line segment - initialized with default
  var local_pos = vec2f(0.0, 0.0);
  if (vertex_idx == 0u) {
    local_pos = seg.start_pos - perp;
  } else if (vertex_idx == 1u) {
    local_pos = seg.start_pos + perp;
  } else if (vertex_idx == 2u) {
    local_pos = seg.end_pos - perp;
  } else if (vertex_idx == 3u) {
    local_pos = seg.start_pos + perp;
  } else if (vertex_idx == 4u) {
    local_pos = seg.end_pos + perp;
  } else if (vertex_idx == 5u) {
    local_pos = seg.end_pos - perp;
  }
  
  let clip_x = (local_pos.x / uniforms.screen_width) * 2.0 - 1.0;
  let clip_y = 1.0 - (local_pos.y / uniforms.screen_height) * 2.0;
  
  var output: VertexOutput;
  output.position = vec4f(clip_x, clip_y, 0.0, 1.0);
  output.alpha = seg.alpha;
  return output;
}

@fragment
fn fs_main(@location(0) alpha: f32) -> @location(0) vec4f {
  return vec4f(uniforms.trail_color_r, uniforms.trail_color_g, uniforms.trail_color_b, alpha * 0.5);
}
`;

interface TrailPoint {
  x: number;
  y: number;
}

const MAX_TRAIL_SEGMENTS = 100000; // Max number of trail line segments

/**
 * Motion trail effect for birds using GPU ring buffer approach.
 * Version: 1.0.0
 */
export class TrailEffect {
  private flux: Flux;
  private enabled: boolean = false;
  private trailLength: number = 20;
  private color: number = 0x00ff88;

  // GPU resources
  private pipeline: GPURenderPipeline | null = null;
  private uniformBuffer: GPUBuffer | null = null;
  private segmentBuffer: GPUBuffer | null = null;
  private bindGroup: GPUBindGroup | null = null;

  // Trail history per bird (ring buffer)
  private trailHistory: Map<number, TrailPoint[]> = new Map();

  // CPU staging buffer for trail segments
  private segmentData: Float32Array;
  private currentSegmentCount: number = 0;

  constructor(flux: Flux, _maxBirds: number, trailLength: number = 20, color: number = 0x00ff88) {
    console.log('TrailEffect v1.1.0 initialized');
    this.flux = flux;
    this.trailLength = trailLength;
    this.color = color;

    // Segment: start(2) + end(2) + alpha(1) + width(1) + pad(2) = 8 floats
    this.segmentData = new Float32Array(MAX_TRAIL_SEGMENTS * 8);

    this.initGPUResources();
  }

  private initGPUResources(): void {
    const device = this.flux.device;

    const shader = this.flux.shader(TRAIL_SHADER, 'trail-shader');

    this.uniformBuffer = device.createBuffer({
      size: 32, // 8 floats
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'trail-uniforms',
    });

    this.segmentBuffer = device.createBuffer({
      size: MAX_TRAIL_SEGMENTS * 32, // 8 floats * 4 bytes
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      label: 'trail-segments',
    });

    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      ],
    });

    this.bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: { buffer: this.segmentBuffer } },
      ],
    });

    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
      vertex: { module: shader, entryPoint: 'vs_main' },
      fragment: {
        module: shader,
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
   * Enable/disable trails.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.trailHistory.clear();
      this.currentSegmentCount = 0;
    }
  }

  /**
   * Update trail configuration.
   */
  updateConfig(trailLength: number, color: number): void {
    this.trailLength = trailLength;
    this.color = color;
  }

  /**
   * Update trails with current positions.
   */
  update(birdArrays: BirdArrays): void {
    if (!this.enabled) return;

    const count = birdArrays.count;

    // Update trail history for each bird
    for (let i = 0; i < count; i++) {
      let trail = this.trailHistory.get(i);

      if (!trail) {
        trail = [];
        this.trailHistory.set(i, trail);
      }

      // Add current position
      trail.push({
        x: birdArrays.positionX[i],
        y: birdArrays.positionY[i],
      });

      // Trim to max length
      while (trail.length > this.trailLength) {
        trail.shift();
      }
    }

    // Clean up trails for removed birds
    for (const id of this.trailHistory.keys()) {
      if (id >= count) {
        this.trailHistory.delete(id);
      }
    }
  }

  /**
   * Render trails.
   */
  render(
    renderPass: GPURenderPassEncoder,
    screenWidth: number,
    screenHeight: number
  ): void {
    if (!this.enabled || !this.pipeline || !this.bindGroup) {
      return;
    }

    // Build segment data
    this.currentSegmentCount = 0;

    for (const [_, trail] of this.trailHistory) {
      if (trail.length < 2) continue;

      for (let i = 1; i < trail.length; i++) {
        if (this.currentSegmentCount >= MAX_TRAIL_SEGMENTS) break;

        const prev = trail[i - 1];
        const curr = trail[i];
        const alpha = (i / trail.length) * 0.5;
        const width = Math.max(0.5, (i / trail.length) * 2);

        const offset = this.currentSegmentCount * 8;
        this.segmentData[offset] = prev.x;
        this.segmentData[offset + 1] = prev.y;
        this.segmentData[offset + 2] = curr.x;
        this.segmentData[offset + 3] = curr.y;
        this.segmentData[offset + 4] = alpha;
        this.segmentData[offset + 5] = width;
        this.segmentData[offset + 6] = 0;
        this.segmentData[offset + 7] = 0;

        this.currentSegmentCount++;
      }
    }

    if (this.currentSegmentCount === 0) return;

    // Unpack color
    const r = ((this.color >> 16) & 0xFF) / 255;
    const g = ((this.color >> 8) & 0xFF) / 255;
    const b = (this.color & 0xFF) / 255;

    // Upload uniforms
    const uniformData = new Float32Array([
      screenWidth,
      screenHeight,
      r,
      g,
      b,
      this.trailLength,
      0,
      0,
    ]);
    this.flux.device.queue.writeBuffer(this.uniformBuffer!, 0, uniformData);
    this.flux.device.queue.writeBuffer(
      this.segmentBuffer!,
      0,
      this.segmentData.buffer,
      0,
      this.currentSegmentCount * 32
    );

    renderPass.setPipeline(this.pipeline);
    renderPass.setBindGroup(0, this.bindGroup);
    renderPass.draw(6, this.currentSegmentCount);
  }

  /**
   * Clean up.
   */
  destroy(): void {
    this.trailHistory.clear();
    this.uniformBuffer?.destroy();
    this.segmentBuffer?.destroy();
  }
}
