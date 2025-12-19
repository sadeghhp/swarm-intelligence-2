/**
 * Swarm Intelligence Simulator
 * Version: 2.2.0
 * 
 * GPU-accelerated flocking simulation using WebGPU via @flux-gpu/core.
 * Falls back to Canvas2D rendering when WebGPU is unavailable.
 */

import { App } from './App';
import { loadConfig, setConfig } from './config';

console.log('Swarm Intelligence Simulator v2.2.0 (WebGPU + Canvas2D fallback)');

async function main(): Promise<void> {
  // Get container element
  const container = document.getElementById('container');
  
  if (!container) {
    console.error('Container element not found');
    return;
  }

  try {
    // Load configuration
    console.log('Loading configuration...');
    const config = await loadConfig('/config.json');
    setConfig(config);
    console.log('Configuration loaded:', config.simulation.birdCount, 'birds');

    // Create and initialize app
    console.log('Initializing application...');
    const app = new App(container, config);
    await app.init();

    // Start simulation
    console.log('Starting simulation...');
    app.start();

    // Expose for debugging
    (window as any).swarmApp = app;

    console.log('Simulation running. Controls:');
    console.log('  Space: Pause/Resume');
    console.log('  R: Reset flock');
    console.log('  G: Toggle GPU/CPU');
    console.log('  Left Click: Add attractor');
    console.log('  Right Click: Add repulsor');

  } catch (error) {
    const errorMsg = error instanceof Error 
      ? error.message 
      : (typeof error === 'object' ? JSON.stringify(error) : String(error));
    console.error('Failed to initialize:', errorMsg, error);
    
    // Show error message to user
    container.innerHTML = `
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100vh;
        color: #ff4444;
        font-family: 'JetBrains Mono', monospace;
        text-align: center;
        padding: 20px;
        background: #1a1a2e;
      ">
        <h1 style="color: #ff6666;">Initialization Failed</h1>
        <p style="color: #888; max-width: 500px; margin: 20px 0;">
          ${error instanceof Error ? error.message : 'Unknown error'}
        </p>
        <div style="color: #666; font-size: 14px; margin-top: 20px; line-height: 1.8;">
          <p style="margin-bottom: 10px;">Possible solutions:</p>
          <ul style="text-align: left; padding-left: 20px;">
            <li>Try refreshing the page</li>
            <li>Use Chrome 113+ or Edge 113+</li>
            <li>Enable WebGPU in browser flags (chrome://flags)</li>
            <li>Update your graphics drivers</li>
            <li>Check browser console for detailed errors</li>
          </ul>
        </div>
        <button onclick="location.reload()" style="
          margin-top: 30px;
          padding: 12px 24px;
          background: #4488ff;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-family: inherit;
          font-size: 14px;
        ">Retry</button>
      </div>
    `;
  }
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}

