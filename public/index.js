/**
 * Gesture Control - Main Entry Point
 * Initializes and coordinates all gesture control components
 */

import { GestureController } from './gesture-controller.js';
import { GestureUI } from './gesture-ui.js';
import { OneEuroFilter2D } from './one-euro-filter.js';

export { GestureController, GestureUI, OneEuroFilter2D };

/**
 * Create and initialize the full gesture control system
 * @param {Object} options - Configuration options
 * @returns {Promise<{controller: GestureController, ui: GestureUI}>}
 */
export async function createGestureControl(options = {}) {
  // Merge default options
  const config = {
    // Camera
    cameraWidth: options.cameraWidth || 640,
    cameraHeight: options.cameraHeight || 480,
    cameraFps: options.cameraFps || 30,

    // Gesture
    mirrorHorizontal: options.mirrorHorizontal === true,  // Landmarks already corrected by worker
    controlRegionRatio: options.controlRegionRatio || 0.8,
    cursorSpeed: options.cursorSpeed || 1.5,
    maxCursorJump: options.maxCursorJump || 50,
    scrollSpeed: options.scrollSpeed || 3.0,
    clickCooldown: options.clickCooldown || 500,

    // One Euro Filter
    oeFrequency: options.oeFrequency || 60,
    oeMincutoff: options.oeMincutoff || 1.0,
    oeBeta: options.oeBeta || 0.0,
    oeDcutoff: options.oeDcutoff || 1.0,

    // UI
    uiContainerId: options.uiContainerId || 'gesture-panel',
    showPreview: options.showPreview !== false,
    showLandmarks: options.showLandmarks !== false,
    showDebug: options.showDebug || false,
    uiPosition: options.uiPosition || 'bottom-right',
    uiTheme: options.uiTheme || 'auto',

    // Auto-start
    autoStart: options.autoStart || false,

    // Callbacks
    onReady: options.onReady || (() => {}),
    onError: options.onError || ((err) => console.error('Gesture Control Error:', err)),
    onGestureChange: options.onGestureChange || (() => {}),
  };

  // Create controller
  const controller = new GestureController({
    cameraWidth: config.cameraWidth,
    cameraHeight: config.cameraHeight,
    cameraFps: config.cameraFps,
    mirrorHorizontal: config.mirrorHorizontal,
    controlRegionRatio: config.controlRegionRatio,
    cursorSpeed: config.cursorSpeed,
    maxCursorJump: config.maxCursorJump,
    scrollSpeed: config.scrollSpeed,
    clickCooldown: config.clickCooldown,
    oeFrequency: config.oeFrequency,
    oeMincutoff: config.oeMincutoff,
    oeBeta: config.oeBeta,
    oeDcutoff: config.oeDcutoff,
    onGestureChange: config.onGestureChange,
    onStatusChange: (status) => {
      // Status changes handled by UI
    },
    onError: config.onError,
    onDebugData: () => {},
  });

  // Create UI
  const ui = new GestureUI(controller, {
    containerId: config.uiContainerId,
    showPreview: config.showPreview,
    showLandmarks: config.showLandmarks,
    showDebug: config.showDebug,
    position: config.uiPosition,
    theme: config.uiTheme,
  });

  // Initialize UI
  ui.init();

  // Initialize controller
  try {
    await controller.init();
    config.onReady({ controller, ui });

    // Auto-start if enabled
    if (config.autoStart) {
      controller.start();
    }

    return { controller, ui };
  } catch (error) {
    config.onError(error);
    throw error;
  }
}

/**
 * Global gesture control instance (for easy access)
 */
let globalInstance = null;

/**
 * Initialize gesture control globally
 */
export async function initGestureControl(options = {}) {
  if (globalInstance) {
    console.warn('Gesture control already initialized');
    return globalInstance;
  }

  globalInstance = await createGestureControl(options);
  return globalInstance;
}

/**
 * Get global instance
 */
export function getGestureControl() {
  return globalInstance;
}

/**
 * Destroy global instance
 */
export function destroyGestureControl() {
  if (globalInstance) {
    globalInstance.ui.destroy();
    globalInstance.controller.destroy();
    globalInstance = null;
  }
}

// Auto-initialize if data-gesture-control attribute is present on body
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const body = document.body;
    if (body.dataset.gestureControl === 'true' || body.dataset.gestureControl === 'auto') {
      const options = {
        autoStart: body.dataset.gestureAutoStart === 'true',
        showDebug: body.dataset.gestureDebug === 'true',
        uiPosition: body.dataset.gesturePosition || 'bottom-right',
      };

      initGestureControl(options).catch(err => {
        console.error('Failed to auto-initialize gesture control:', err);
      });
    }
  });
}

export default {
  createGestureControl,
  initGestureControl,
  getGestureControl,
  destroyGestureControl,
  GestureController,
  GestureUI,
  OneEuroFilter2D,
};