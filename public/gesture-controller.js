/**
 * Gesture Controller - Main Thread
 * Manages Web Worker, executes gestures, handles UI integration
 */

import { OneEuroFilter2D } from './one-euro-filter.js';

export class GestureController {
  constructor(options = {}) {
    this.options = {
      // Camera settings
      cameraWidth: options.cameraWidth || 640,
      cameraHeight: options.cameraHeight || 480,
      cameraFps: options.cameraFps || 30,

      // Gesture settings
      mirrorHorizontal: options.mirrorHorizontal !== false,
      controlRegionRatio: options.controlRegionRatio || 0.8,
      cursorSpeed: options.cursorSpeed || 1.5,
      maxCursorJump: options.maxCursorJump || 50,
      scrollSpeed: options.scrollSpeed || 3.0,
      scrollSmoothing: options.scrollSmoothing || 0.3,
      clickCooldown: options.clickCooldown || 500,

      // One Euro Filter settings
      oeFrequency: options.oeFrequency || 60,
      oeMincutoff: options.oeMincutoff || 1.0,
      oeBeta: options.oeBeta || 0.0,
      oeDcutoff: options.oeDcutoff || 1.0,

      // Callbacks
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

    // State
    this.currentGesture = 'NEUTRAL';
    this.lastClickTime = 0;
    this.isDragging = false;
    this.virtualCursor = { x: 0.5, y: 0.5 };
    this.screenWidth = window.screen.width;
    this.screenHeight = window.screen.height;

    // Control region bounds
    this.updateControlRegion();

    // Cursor smoothing filter
    this.cursorFilter = new OneEuroFilter2D({
      frequency: this.options.oeFrequency,
      mincutoff: this.options.oeMincutoff,
      beta: this.options.oeBeta,
      dcutoff: this.options.oeDcutoff,
    });

    // FPS tracking
    this.frameCount = 0;
    this.fpsStartTime = performance.now();
    this.currentFps = 0;

    // Timestamp for worker
    this.frameTimestamp = 0;
  }

  updateControlRegion() {
    const ratio = this.options.controlRegionRatio;
    const margin = (1 - ratio) / 2;
    this.controlRegion = {
      minX: margin,
      maxX: 1 - margin,
      minY: margin,
      maxY: 1 - margin,
    };
  }

  /**
   * Initialize the gesture control system
   */
  async init() {
    if (this.isInitialized) return;

    this.options.onStatusChange('initializing');

    try {
      // Create Web Worker (classic worker for importScripts)
      console.log('[Controller] Creating worker...');
      this.worker = new Worker('/gesture-worker.js');

      // Handle worker messages
      this.worker.onmessage = (event) => {
        console.log('[Controller] Worker message:', event.data.type, event.data);
        this.handleWorkerMessage(event);
      };
      this.worker.onerror = (error) => {
        console.error('[Controller] Worker error:', error);
        this.handleWorkerError(error);
      };

      // Initialize worker with config
      this.worker.postMessage({
        type: 'INIT',
        data: {
          config: {
            cameraWidth: this.options.cameraWidth,
            cameraHeight: this.options.cameraHeight,
            mirrorHorizontal: this.options.mirrorHorizontal,
            controlRegionRatio: this.options.controlRegionRatio,
            cursorSpeed: this.options.cursorSpeed,
          }
        }
      });

      // Wait for worker ready
      console.log('[Controller] Waiting for worker READY...');
      await this.waitForWorkerReady();
      console.log('[Controller] Worker READY received');

      // Get camera access
      console.log('[Controller] Initializing camera...');
      await this.initCamera();
      console.log('[Controller] Camera initialized');

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
      const timeout = setTimeout(() => {
        reject(new Error('Worker initialization timeout'));
      }, 15000); // Increased timeout for MediaPipe loading

      const handler = (event) => {
        if (event.data.type === 'READY') {
          clearTimeout(timeout);
          this.worker.onmessage = (e) => this.handleWorkerMessage(e);
          resolve();
        } else if (event.data.type === 'ERROR') {
          clearTimeout(timeout);
          reject(new Error(event.data.error));
        }
        // Ignore WORKER_LOADED - wait for actual READY after MediaPipe init
      };

      this.worker.onmessage = handler;
    });
  }

  /**
   * Initialize camera access
   */
  async initCamera() {
    try {
      this.videoStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: this.options.cameraWidth },
          height: { ideal: this.options.cameraHeight },
          frameRate: { ideal: this.options.cameraFps },
          facingMode: 'user'
        }
      });

      this.videoElement = document.createElement('video');
      this.videoElement.srcObject = this.videoStream;
      this.videoElement.width = this.options.cameraWidth;
      this.videoElement.height = this.options.cameraHeight;
      this.videoElement.playsInline = true;
      this.videoElement.muted = true;

      // Create canvas for frame capture
      this.canvasElement = document.createElement('canvas');
      this.canvasElement.width = this.options.cameraWidth;
      this.canvasElement.height = this.options.cameraHeight;
      this.canvasContext = this.canvasElement.getContext('2d', { willReadFrequently: true });

      await this.videoElement.play();

    } catch (error) {
      if (error.name === 'NotAllowedError') {
        throw new Error('Camera permission denied');
      } else if (error.name === 'NotFoundError') {
        throw new Error('No camera found');
      } else if (error.name === 'NotReadableError') {
        throw new Error('Camera is in use by another application');
      }
      throw error;
    }
  }

  /**
   * Start the gesture recognition loop
   */
  start() {
    if (this.isRunning) return;
    if (!this.isInitialized) {
      throw new Error('Not initialized. Call init() first.');
    }

    this.isRunning = true;
    this.options.onStatusChange('running');
    this.processFrame();
  }

  /**
   * Stop the gesture recognition
   */
  stop() {
    this.isRunning = false;

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    this.stopCamera();
    this.options.onStatusChange('stopped');
  }

  /**
   * Stop camera and clean up
   */
  stopCamera() {
    if (this.videoStream) {
      this.videoStream.getTracks().forEach(track => track.stop());
      this.videoStream = null;
    }
    this.videoElement = null;
    this.canvasElement = null;
    this.canvasContext = null;
  }

  /**
   * Main processing loop
   */
  processFrame() {
    if (!this.isRunning || !this.videoElement || !this.canvasContext) return;

    // Check if video is ready
    const videoReady = this.videoElement.readyState >= HTMLVideoElement.HAVE_ENOUGH_DATA;
    const videoWidth = this.videoElement.videoWidth;
    const videoHeight = this.videoElement.videoHeight;

    // Send video diagnostics
    this.options.onDebugData({
      type: 'VIDEO_DIAG',
      videoReady,
      videoWidth,
      videoHeight,
      fps: this.currentFps
    });

    if (!videoReady) {
      this.animationFrameId = requestAnimationFrame(() => this.processFrame());
      return;
    }

    // Draw video frame to canvas (RAW - worker handles mirroring correction)
    this.canvasContext.drawImage(this.videoElement, 0, 0, this.canvasElement.width, this.canvasElement.height);

    // Get image data
    const imageData = this.canvasContext.getImageData(0, 0, this.canvasElement.width, this.canvasElement.height);

    // Use actual video timestamp for MediaPipe VIDEO mode
    const timestamp = this.videoElement.currentTime * 1000;
    this.worker.postMessage({
      type: 'PROCESS_FRAME',
      data: { imageData, timestamp }
    }, [imageData.data.buffer]); // Transfer ownership

    // Update FPS
    this.updateFps();

    // Continue loop
    this.animationFrameId = requestAnimationFrame(() => this.processFrame());
  }

  updateFps() {
    this.frameCount++;
    const now = performance.now();
    if (now - this.fpsStartTime >= 1000) {
      this.currentFps = this.frameCount / ((now - this.fpsStartTime) / 1000);
      this.frameCount = 0;
      this.fpsStartTime = now;
    }
  }

  /**
   * Handle messages from worker
   */
  handleWorkerMessage(event) {
    const { type, data } = event.data;

    switch (type) {
      case 'RESULTS':
        this.handleResults(data);
        break;

      case 'NO_HAND':
        this.handleNoHand();
        break;

      case 'ERROR':
        this.options.onError(new Error(data.error));
        break;

      case 'READY':
        // Worker ready (fallback)
        break;

      case 'DIAG_UPDATE':
        this.handleDiagUpdate(data);
        break;
    }
  }

  handleDiagUpdate(diagData) {
    this.options.onDebugData({
      type: 'DIAG_UPDATE',
      ...diagData
    });
  }

  handleWorkerError(error) {
    console.error('Worker error:', error);
    this.options.onError(new Error(error.message));
  }

  /**
   * Process gesture results from worker
   */
  handleResults(data) {
    const { gestureInfo, landmarks, handedness, timestamp } = data;

    // Update state
    this.currentGesture = gestureInfo.gesture;

    // Execute gesture actions
    this.executeGesture(gestureInfo, landmarks);

    // Call gesture change callback
    this.options.onGestureChange(gestureInfo);

    // Call debug callback
    this.options.onDebugData({
      ...gestureInfo,
      landmarks,
      handedness,
      fps: this.currentFps,
      timestamp
    });
  }

  handleNoHand() {
    // Could implement no-hand timeout here
    this.options.onDebugData({
      gesture: 'NO_HAND',
      fps: this.currentFps
    });
  }

  /**
   * Execute gesture actions on the page
   */
  executeGesture(gestureInfo, landmarks) {
    const { gesture, isClickTriggered, isClickReleased, isStopTriggered,
            indexTip, handCenter, scrollVelocity } = gestureInfo;

    switch (gesture) {
      case 'STOP':
        this.handleStop();
        break;

      case 'CLICK':
        if (isClickTriggered) {
          this.handleClick(indexTip);
        }
        // Cursor still follows index tip during click
        this.updateVirtualCursor(indexTip);
        break;

      case 'SCROLL':
        this.handleScroll(scrollVelocity);
        this.updateVirtualCursor(indexTip);
        break;

      case 'CURSOR':
        this.updateVirtualCursor(indexTip);
        break;

      case 'NEUTRAL':
        // No action
        break;
    }
  }

  /**
   * Emergency stop - reset everything
   */
  handleStop() {
    this.virtualCursor = { x: 0.5, y: 0.5 };
    this.cursorFilter.reset(0.5, 0.5);
    this.isDragging = false;
    // Could also stop any ongoing scroll animations
  }

  /**
   * Handle click gesture
   */
  handleClick(indexTip) {
    const now = Date.now();
    if (now - this.lastClickTime < this.options.clickCooldown) return;

    this.lastClickTime = now;

    // Get element at virtual cursor position
    const element = this.getElementAtCursor();
    if (element) {
      // Dispatch click event
      element.click();

      // Visual feedback
      this.showClickFeedback(element);
    }
  }

  /**
   * Handle scroll gesture
   */
  handleScroll(scrollVelocity) {
    if (Math.abs(scrollVelocity) < 0.5) return; // Threshold

    // Use Lenis if available for smooth scrolling
    if (window.lenis) {
      window.lenis.scrollBy(0, scrollVelocity * this.options.scrollSpeed);
    } else {
      // Fallback to native scroll
      window.scrollBy(0, scrollVelocity * this.options.scrollSpeed);
    }
  }

  /**
   * Update virtual cursor position with smoothing
   */
  updateVirtualCursor(normalizedPos) {
    if (!normalizedPos) return;

    let { x, y } = normalizedPos;

    // Apply mirror
    if (this.options.mirrorHorizontal) {
      x = 1 - x;
    }

    // Clamp to control region
    x = Math.max(this.controlRegion.minX, Math.min(this.controlRegion.maxX, x));
    y = Math.max(this.controlRegion.minY, Math.min(this.controlRegion.maxY, y));

    // Remap from control region to full screen
    x = (x - this.controlRegion.minX) / (this.controlRegion.maxX - this.controlRegion.minX);
    y = (y - this.controlRegion.minY) / (this.controlRegion.maxY - this.controlRegion.minY);

    // Apply speed multiplier
    x = 0.5 + (x - 0.5) * this.options.cursorSpeed;
    y = 0.5 + (y - 0.5) * this.options.cursorSpeed;

    // Clamp to 0-1
    x = Math.max(0, Math.min(1, x));
    y = Math.max(0, Math.min(1, y));

    // Smooth with One Euro Filter
    const timestamp = performance.now() / 1000;
    const [smoothX, smoothY] = this.cursorFilter.update(x, y, timestamp);

    // Limit max jump
    const dx = smoothX - this.virtualCursor.x;
    const dy = smoothY - this.virtualCursor.y;
    const distance = Math.hypot(dx, dy);

    if (distance > this.options.maxCursorJump / Math.max(this.screenWidth, this.screenHeight)) {
      const scale = (this.options.maxCursorJump / Math.max(this.screenWidth, this.screenHeight)) / distance;
      this.virtualCursor.x += dx * scale;
      this.virtualCursor.y += dy * scale;
    } else {
      this.virtualCursor.x = smoothX;
      this.virtualCursor.y = smoothY;
    }

    // Update virtual cursor element if exists
    this.updateVirtualCursorElement();
  }

  /**
   * Get DOM element at virtual cursor position
   */
  getElementAtCursor() {
    const x = this.virtualCursor.x * window.innerWidth;
    const y = this.virtualCursor.y * window.innerHeight;

    // Use elementFromPoint
    return document.elementFromPoint(x, y);
  }

  /**
   * Show visual feedback for click
   */
  showClickFeedback(element) {
    // Add a brief animation class
    element.classList.add('gesture-clicked');
    setTimeout(() => {
      element.classList.remove('gesture-clicked');
    }, 150);
  }

  /**
   * Update virtual cursor DOM element
   */
  updateVirtualCursorElement() {
    const cursor = document.getElementById('gesture-virtual-cursor');
    if (cursor) {
      cursor.style.transform = `translate(${this.virtualCursor.x * 100}%, ${this.virtualCursor.y * 100}%)`;
    }
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      isInitialized: this.isInitialized,
      currentGesture: this.currentGesture,
      virtualCursor: { ...this.virtualCursor },
      fps: this.currentFps,
      hasCamera: !!this.videoStream,
    };
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(newConfig) {
    this.options = { ...this.options, ...newConfig };
    this.updateControlRegion();

    // Update filter if params changed
    if (newConfig.oeFrequency || newConfig.oeMincutoff || newConfig.oeBeta || newConfig.oeDcutoff) {
      this.cursorFilter = new OneEuroFilter2D({
        frequency: this.options.oeFrequency,
        mincutoff: this.options.oeMincutoff,
        beta: this.options.oeBeta,
        dcutoff: this.options.oeDcutoff,
      });
    }

    // Send to worker
    if (this.worker) {
      this.worker.postMessage({
        type: 'UPDATE_CONFIG',
        data: { config: newConfig }
      });
    }
  }

  /**
   * Cleanup everything
   */
  destroy() {
    this.stop();

    if (this.worker) {
      this.worker.postMessage({ type: 'STOP' });
      this.worker.terminate();
      this.worker = null;
    }

    this.isInitialized = false;
  }
}

// Export for module usage
export default GestureController;