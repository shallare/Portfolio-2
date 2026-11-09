/**
 * Gesture Controller - Main Thread
 * Manages Web Worker, executes gestures, handles UI integration
 */

import { OneEuroFilter2D } from './one-euro-filter.js';

export class GestureController {
  constructor(options = {}) {
    this.options = {
      cameraWidth: options.cameraWidth || 640,
      cameraHeight: options.cameraHeight || 480,
      cameraFps: options.cameraFps || 30,
      mirrorHorizontal: options.mirrorHorizontal !== false,
      controlRegionRatio: options.controlRegionRatio || 0.8,
      cursorSpeed: options.cursorSpeed || 1.5,
      maxCursorJump: options.maxCursorJump || 50,
      scrollSpeed: options.scrollSpeed || 3.0,
      scrollSmoothing: options.scrollSmoothing || 0.3,
      clickCooldown: options.clickCooldown || 500,
      oeFrequency: options.oeFrequency || 60,
      oeMincutoff: options.oeMincutoff || 1.0,
      oeBeta: options.oeBeta || 0.0,
      oeDcutoff: options.oeDcutoff || 1.0,
      onGestureChange: options.onGestureChange || (() => {}),
      onStatusChange: options.onStatusChange || (() => {}),
      onError: options.onError || (() => {}),
      onDebugData: options.onDebugData || (() => {}),
    };

    this.worker = null;
    this.videoStream = null;
    this.videoElement = null;
    this.canvasElement = null;
    this.canvasContext = null;
    this.animationFrameId = null;
    this.isRunning = false;
    this.isInitialized = false;
    this.currentGesture = 'NEUTRAL';
    this.lastClickTime = 0;
    this.isDragging = false;
    this.virtualCursor = { x: 0.5, y: 0.5 };
    this.screenWidth = window.screen.width;
    this.screenHeight = window.screen.height;
    this.updateControlRegion();

    // Hover tracking
    this.hoveredElement = null;

    this.cursorFilter = new OneEuroFilter2D({
      frequency: this.options.oeFrequency,
      mincutoff: this.options.oeMincutoff,
      beta: this.options.oeBeta,
      dcutoff: this.options.oeDcutoff,
    });

    this.frameCount = 0;
    this.fpsStartTime = performance.now();
    this.currentFps = 0;
  }

  updateControlRegion() {
    const ratio = this.options.controlRegionRatio;
    const margin = (1 - ratio) / 2;
    this.controlRegion = { minX: margin, maxX: 1 - margin, minY: margin, maxY: 1 - margin };
  }

  async init() {
    if (this.isInitialized) return;
    this.options.onStatusChange('initializing');

    try {
      console.log('[Controller] Creating worker...');
      this.worker = new Worker(new URL('./gesture-worker.js', import.meta.url));

      this.worker.onmessage = (event) => {
        console.log('[Controller] Worker:', event.data.type);
        this.handleWorkerMessage(event);
      };
      this.worker.onerror = (error) => {
        console.error('[Controller] Worker error:', error);
        this.handleWorkerError(error);
      };

      this.worker.postMessage({
        type: 'INIT',
        data: {
          config: {
            cameraWidth: this.options.cameraWidth,
            cameraHeight: this.options.cameraHeight,
            mirrorHorizontal: this.options.mirrorHorizontal,
            controlRegionRatio: this.options.controlRegionRatio,
            cursorSpeed: this.options.cursorSpeed,
            maxNumHands: 1,
            minDetectionConfidence: 0.6,
            minTrackingConfidence: 0.5,
          }
        }
      });

      await this.waitForWorkerReady();
      await this.initCamera();
      this.isInitialized = true;
      this.options.onStatusChange('ready');
    } catch (error) {
      console.error('[Controller] Init error:', error);
      this.options.onStatusChange('error');
      this.options.onError(error);
      throw error;
    }
  }

  waitForWorkerReady() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Worker timeout')), 20000);
      const handler = (event) => {
        if (event.data.type === 'READY') { clearTimeout(timeout); this.worker.onmessage = (e) => this.handleWorkerMessage(e); resolve(); }
        else if (event.data.type === 'ERROR') { clearTimeout(timeout); reject(new Error(event.data.error)); }
      };
      this.worker.onmessage = handler;
    });
  }

  async initCamera() {
    try {
      this.videoStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: this.options.cameraWidth }, height: { ideal: this.options.cameraHeight }, frameRate: { ideal: this.options.cameraFps }, facingMode: 'user' }
      });

      this.videoElement = document.createElement('video');
      this.videoElement.srcObject = this.videoStream;
      this.videoElement.width = this.options.cameraWidth;
      this.videoElement.height = this.options.cameraHeight;
      this.videoElement.playsInline = true;
      this.videoElement.muted = true;

      this.canvasElement = document.createElement('canvas');
      this.canvasElement.width = this.options.cameraWidth;
      this.canvasElement.height = this.options.cameraHeight;
      this.canvasContext = this.canvasElement.getContext('2d', { willReadFrequently: true });

      await this.videoElement.play();
    } catch (error) {
      if (error.name === 'NotAllowedError') throw new Error('Permission caméra refusée');
      if (error.name === 'NotFoundError') throw new Error('Aucune caméra trouvée');
      if (error.name === 'NotReadableError') throw new Error('Caméra utilisée par une autre application');
      throw error;
    }
  }

  start() {
    if (this.isRunning) return;
    if (!this.isInitialized) throw new Error('Pas initialisé. Appelez init() d\'abord.');
    this.isRunning = true;
    this.options.onStatusChange('running');
    this.showVirtualCursor(true);
    this.processFrame();
  }

  stop() {
    this.isRunning = false;
    if (this.animationFrameId) { cancelAnimationFrame(this.animationFrameId); this.animationFrameId = null; }
    this.stopCamera();
    this.showVirtualCursor(false);
    this.clearHover();
    this.options.onStatusChange('stopped');
  }

  stopCamera() {
    if (this.videoStream) { this.videoStream.getTracks().forEach(t => t.stop()); this.videoStream = null; }
    this.videoElement = null; this.canvasElement = null; this.canvasContext = null;
  }

  processFrame() {
    if (!this.isRunning || !this.videoElement || !this.canvasContext) return;

    const videoReady = this.videoElement.readyState >= HTMLVideoElement.HAVE_ENOUGH_DATA;
    const vw = this.videoElement.videoWidth, vh = this.videoElement.videoHeight;

    this.options.onDebugData({ type: 'VIDEO_DIAG', videoReady, videoWidth: vw, videoHeight: vh, fps: this.currentFps });

    if (!videoReady) { this.animationFrameId = requestAnimationFrame(() => this.processFrame()); return; }

    this.canvasContext.drawImage(this.videoElement, 0, 0, this.canvasElement.width, this.canvasElement.height);
    const imageData = this.canvasContext.getImageData(0, 0, this.canvasElement.width, this.canvasElement.height);
    const timestamp = this.videoElement.currentTime * 1000;

    this.worker.postMessage({ type: 'PROCESS_FRAME', data: { imageData, timestamp } }, [imageData.data.buffer]);
    this.updateFps();
    this.animationFrameId = requestAnimationFrame(() => this.processFrame());
  }

  updateFps() {
    this.frameCount++;
    const now = performance.now();
    if (now - this.fpsStartTime >= 1000) { this.currentFps = this.frameCount / ((now - this.fpsStartTime) / 1000); this.frameCount = 0; this.fpsStartTime = now; }
  }

  handleWorkerMessage(event) {
    const { type, data } = event.data;
    switch (type) {
      case 'RESULTS': this.handleResults(data); break;
      case 'NO_HAND': this.handleNoHand(); break;
      case 'ERROR': this.options.onError(new Error(data.error)); break;
      case 'DIAG_UPDATE': this.handleDiagUpdate(data); break;
    }
  }

  handleDiagUpdate(d) { this.options.onDebugData({ type: 'DIAG_UPDATE', ...d }); }
  handleWorkerError(e) { this.options.onError(new Error(e.message)); }

  handleResults(data) {
    const { gestureInfo, landmarks } = data;
    this.currentGesture = gestureInfo.gesture;
    this.executeGesture(gestureInfo, landmarks);
    this.options.onGestureChange(gestureInfo);
    this.options.onDebugData({ ...gestureInfo, landmarks, fps: this.currentFps });
    this.showVirtualCursor(true);
    this.updateHover(gestureInfo);
  }

  handleNoHand() {
    this.options.onDebugData({ gesture: 'NO_HAND', fps: this.currentFps });
    this.showVirtualCursor(false);
    this.clearHover();
  }

  executeGesture(gestureInfo, landmarks) {
    const { gesture, isClickTriggered, isClickReleased, indexTip, scrollVelocity } = gestureInfo;
    switch (gesture) {
      case 'STOP': this.handleStop(); break;
      case 'CLICK':
        if (isClickTriggered) this.handleClick(indexTip);
        this.updateVirtualCursor(indexTip);
        break;
      case 'SCROLL': this.handleScroll(scrollVelocity); this.updateVirtualCursor(indexTip); break;
      case 'CURSOR': this.updateVirtualCursor(indexTip); break;
    }
  }

  handleStop() {
    console.log('[Controller] STOP gesture - Resetting all');
    this.virtualCursor = { x: 0.5, y: 0.5 };
    this.cursorFilter.reset(0.5, 0.5);
    this.isDragging = false;
    this.clearHover();
    this.showVirtualCursor(false);
    // Reset worker state
    if (this.worker) this.worker.postMessage({ type: 'RESET' });
  }

  handleClick(indexTip) {
    const now = Date.now();
    if (now - this.lastClickTime < this.options.clickCooldown) return;
    this.lastClickTime = now;

    const element = this.getClickableElementAtCursor();
    if (element) {
      // Scroll into view if needed
      element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      setTimeout(() => {
        element.click();
        this.showClickFeedback(element);
      }, 100);
    }
  }

  handleScroll(scrollVelocity) {
    if (Math.abs(scrollVelocity) < 0.5) return;
    if (window.lenis) window.lenis.scrollBy(0, scrollVelocity * this.options.scrollSpeed);
    else window.scrollBy(0, scrollVelocity * this.options.scrollSpeed);
  }

  updateVirtualCursor(normalizedPos) {
    if (!normalizedPos) return;
    let { x, y } = normalizedPos;
    if (this.options.mirrorHorizontal) x = 1 - x;
    x = Math.max(this.controlRegion.minX, Math.min(this.controlRegion.maxX, x));
    y = Math.max(this.controlRegion.minY, Math.min(this.controlRegion.maxY, y));
    x = (x - this.controlRegion.minX) / (this.controlRegion.maxX - this.controlRegion.minX);
    y = (y - this.controlRegion.minY) / (this.controlRegion.maxY - this.controlRegion.minY);
    x = 0.5 + (x - 0.5) * this.options.cursorSpeed;
    y = 0.5 + (y - 0.5) * this.options.cursorSpeed;
    x = Math.max(0, Math.min(1, x)); y = Math.max(0, Math.min(1, y));

    const timestamp = performance.now() / 1000;
    const [smoothX, smoothY] = this.cursorFilter.update(x, y, timestamp);

    const dx = smoothX - this.virtualCursor.x, dy = smoothY - this.virtualCursor.y;
    const dist = Math.hypot(dx, dy);
    const maxJump = this.options.maxCursorJump / Math.max(this.screenWidth, this.screenHeight);
    if (dist > maxJump) { const s = maxJump / dist; this.virtualCursor.x += dx * s; this.virtualCursor.y += dy * s; }
    else { this.virtualCursor.x = smoothX; this.virtualCursor.y = smoothY; }

    this.updateVirtualCursorElement();
  }

  getClickableElementAtCursor() {
    const x = this.virtualCursor.x * window.innerWidth;
    const y = this.virtualCursor.y * window.innerHeight;

    // Get element at cursor position
    let element = document.elementFromPoint(x, y);
    if (!element) return null;

    // Find nearest clickable ancestor
    const clickableSelectors = 'a, button, [role="button"], [onclick], .magnetic-btn, .btn-primary, .btn-outline, .project-cta, .social-link, .submit-btn, .filter-btn, .nav-link, .mobile-nav-link, .gallery-item, .lightbox-btn, .reaction-btn, input, textarea, select, label, [tabindex]:not([tabindex="-1"])';

    while (element && element !== document.body) {
      if (element.matches && element.matches(clickableSelectors)) {
        return element;
      }
      element = element.parentElement;
    }

    // Fallback: if element itself is interactive
    const tag = element.tagName.toLowerCase();
    if (['a', 'button', 'input', 'textarea', 'select', 'label'].includes(tag)) return element;

    return null;
  }

  getElementAtCursor() {
    const x = this.virtualCursor.x * window.innerWidth;
    const y = this.virtualCursor.y * window.innerHeight;
    return document.elementFromPoint(x, y);
  }

  showClickFeedback(element) {
    element.classList.add('gesture-clicked');
    // Visual feedback on cursor too
    const cursor = document.getElementById('gesture-virtual-cursor');
    if (cursor) cursor.classList.add('clicking');
    setTimeout(() => {
      element.classList.remove('gesture-clicked');
      if (cursor) cursor.classList.remove('clicking');
    }, 200);
  }

  updateVirtualCursorElement() {
    const cursor = document.getElementById('gesture-virtual-cursor');
    if (cursor) {
      cursor.style.transform = `translate(${this.virtualCursor.x * 100}%, ${this.virtualCursor.y * 100}%)`;
    }
  }

  showVirtualCursor(show) {
    const cursor = document.getElementById('gesture-virtual-cursor');
    if (cursor) {
      cursor.style.display = show ? 'block' : 'none';
    }
  }

  updateHover(gestureInfo) {
    // Get element under virtual cursor
    const element = this.getElementAtCursor();

    // Clear previous hover
    if (this.hoveredElement && this.hoveredElement !== element) {
      this.hoveredElement.classList.remove('gesture-hover');
    }

    // Set new hover on clickable elements
    if (element) {
      const clickableSelectors = 'a, button, [role="button"], [onclick], .magnetic-btn, .btn-primary, .btn-outline, .project-cta, .social-link, .submit-btn, .filter-btn, .nav-link, .mobile-nav-link, .gallery-item, .lightbox-btn, .reaction-btn, input, textarea, select, label, [tabindex]:not([tabindex="-1"])';
      if (element.matches && element.matches(clickableSelectors)) {
        element.classList.add('gesture-hover');
        this.hoveredElement = element;
        return;
      }
      // Check parents
      let parent = element.parentElement;
      while (parent && parent !== document.body) {
        if (parent.matches && parent.matches(clickableSelectors)) {
          parent.classList.add('gesture-hover');
          this.hoveredElement = parent;
          return;
        }
        parent = parent.parentElement;
      }
    }

    // No clickable element under cursor
    this.clearHover();
  }

  clearHover() {
    if (this.hoveredElement) {
      this.hoveredElement.classList.remove('gesture-hover');
      this.hoveredElement = null;
    }
  }

  getStatus() {
    return { isRunning: this.isRunning, isInitialized: this.isInitialized, currentGesture: this.currentGesture, virtualCursor: { ...this.virtualCursor }, fps: this.currentFps, hasCamera: !!this.videoStream };
  }

  updateConfig(newConfig) {
    this.options = { ...this.options, ...newConfig };
    this.updateControlRegion();
    if (newConfig.oeFrequency || newConfig.oeMincutoff || newConfig.oeBeta || newConfig.oeDcutoff) {
      this.cursorFilter = new OneEuroFilter2D({ frequency: this.options.oeFrequency, mincutoff: this.options.oeMincutoff, beta: this.options.oeBeta, dcutoff: this.options.oeDcutoff });
    }
    if (this.worker) this.worker.postMessage({ type: 'UPDATE_CONFIG', data: { config: newConfig } });
  }

  destroy() {
    this.stop();
    if (this.worker) { this.worker.postMessage({ type: 'STOP' }); this.worker.terminate(); this.worker = null; }
    this.isInitialized = false;
  }
}

export default GestureController;