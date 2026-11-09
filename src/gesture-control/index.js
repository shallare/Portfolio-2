/**
 * Gesture Control - Main Entry Point
 * Initializes and coordinates all gesture control components
 */

import { GestureController } from './gesture-controller.js';
import { GestureUI } from './gesture-ui.js';
import { OneEuroFilter2D } from './one-euro-filter.js';

export { GestureController, GestureUI, OneEuroFilter2D };

export async function createGestureControl(options = {}) {
  const config = {
    cameraWidth: options.cameraWidth || 640,
    cameraHeight: options.cameraHeight || 480,
    cameraFps: options.cameraFps || 30,
    mirrorHorizontal: options.mirrorHorizontal === true,
    controlRegionRatio: options.controlRegionRatio || 0.8,
    cursorSpeed: options.cursorSpeed || 1.5,
    maxCursorJump: options.maxCursorJump || 50,
    scrollSpeed: options.scrollSpeed || 3.0,
    clickCooldown: options.clickCooldown || 500,
    oeFrequency: options.oeFrequency || 60,
    oeMincutoff: options.oeMincutoff || 1.0,
    oeBeta: options.oeBeta || 0.0,
    oeDcutoff: options.oeDcutoff || 1.0,
    uiContainerId: options.uiContainerId || 'gesture-panel',
    showPreview: options.showPreview !== false,
    showLandmarks: options.showLandmarks !== false,
    showDiagnostics: options.showDiagnostics !== false,
    uiPosition: options.uiPosition || 'bottom-right',
    uiTheme: options.uiTheme || 'auto',
    autoStart: options.autoStart || false,
    onReady: options.onReady || (() => {}),
    onError: options.onError || ((err) => console.error('Gesture Error:', err)),
    onGestureChange: options.onGestureChange || (() => {}),
  };

  const controller = new GestureController({
    cameraWidth: config.cameraWidth, cameraHeight: config.cameraHeight, cameraFps: config.cameraFps,
    mirrorHorizontal: config.mirrorHorizontal, controlRegionRatio: config.controlRegionRatio,
    cursorSpeed: config.cursorSpeed, maxCursorJump: config.maxCursorJump,
    scrollSpeed: config.scrollSpeed, clickCooldown: config.clickCooldown,
    oeFrequency: config.oeFrequency, oeMincutoff: config.oeMincutoff,
    oeBeta: config.oeBeta, oeDcutoff: config.oeDcutoff,
    onGestureChange: config.onGestureChange,
    onStatusChange: (s) => {},
    onError: config.onError,
    onDebugData: () => {},
  });

  const ui = new GestureUI(controller, {
    containerId: config.uiContainerId, showPreview: config.showPreview,
    showLandmarks: config.showLandmarks, showDiagnostics: config.showDiagnostics,
    position: config.uiPosition, theme: config.uiTheme,
  });

  ui.init();

  try {
    await controller.init();
    config.onReady({ controller, ui });
    if (config.autoStart) controller.start();
    return { controller, ui };
  } catch (error) { config.onError(error); throw error; }
}

let globalInstance = null;

export async function initGestureControl(options = {}) {
  if (globalInstance) { console.warn('Gesture already initialized'); return globalInstance; }
  globalInstance = await createGestureControl(options);
  return globalInstance;
}

export function getGestureControl() { return globalInstance; }

export function destroyGestureControl() {
  if (globalInstance) { globalInstance.ui.destroy(); globalInstance.controller.destroy(); globalInstance = null; }
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const body = document.body;
    if (body.dataset.gestureControl === 'true' || body.dataset.gestureControl === 'auto') {
      const opts = {
        autoStart: body.dataset.gestureAutoStart === 'true',
        showDiagnostics: body.dataset.gestureDebug === 'true',
        uiPosition: body.dataset.gesturePosition || 'bottom-right',
      };
      initGestureControl(opts).catch(err => console.error('Auto-init failed:', err));
    }
  });
}

export default { createGestureControl, initGestureControl, getGestureControl, destroyGestureControl, GestureController, GestureUI, OneEuroFilter2D };