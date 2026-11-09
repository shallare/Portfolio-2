/**
 * Gesture UI - Control Panel with Diagnostics
 */

export class GestureUI {
  constructor(controller, options = {}) {
    this.controller = controller;
    this.options = {
      containerId: options.containerId || 'gesture-panel',
      showPreview: options.showPreview !== false,
      showLandmarks: options.showLandmarks !== false,
      showDiagnostics: options.showDiagnostics !== false,
      position: options.position || 'bottom-right',
      theme: options.theme || 'auto',
    };
    this.container = null;
    this.previewCanvas = null;
    this.previewContext = null;
    this.isPanelOpen = false;
    this.lastLandmarks = null;
    this.animationFrameId = null;
    this.diagState = {
      camera: 'unknown', mediapipe: 'unknown', handsDetected: 0,
      landmarksCount: 0, fingersExtended: 0, fingerStates: [false, false, false, false, false],
      pinchDistance: 0, classifiedGesture: 'NEUTRAL', executedAction: 'None',
      processingFps: 0, lastError: null, lastErrorTime: 0,
    };
    this.onGestureChange = this.onGestureChange.bind(this);
    this.onStatusChange = this.onStatusChange.bind(this);
    this.onError = this.onError.bind(this);
    this.onDebugData = this.onDebugData.bind(this);
  }

  init() {
    this.createContainer();
    this.createStyles();
    this.attachEventListeners();
    this.setupControllerCallbacks();
    document.addEventListener('keydown', (e) => {
      if ((e.key === 'g' || e.key === 'G') && !e.target.matches('input, textarea, [contenteditable]')) this.togglePanel();
    });
  }

  setupControllerCallbacks() {
    this.controller.options.onGestureChange = this.onGestureChange;
    this.controller.options.onStatusChange = this.onStatusChange;
    this.controller.options.onError = this.onError;
    this.controller.options.onDebugData = this.onDebugData;
  }

  createContainer() {
    this.container = document.createElement('div');
    this.container.id = this.options.containerId;
    this.container.className = 'gesture-panel';
    this.container.setAttribute('role', 'region');
    this.container.setAttribute('aria-label', 'Gesture Control Panel');
    this.container.classList.add(`gesture-panel--${this.options.position}`);
    if (this.options.theme === 'auto') { this.updateTheme(); window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.updateTheme()); }
    else this.container.classList.add(`gesture-panel--${this.options.theme}`);

    this.container.innerHTML = this.getPanelHTML();
    document.body.appendChild(this.container);

    this.elements = {
      toggleBtn: this.container.querySelector('.gesture-panel__toggle'),
      panel: this.container.querySelector('.gesture-panel__content'),
      statusIndicator: this.container.querySelector('.gesture-panel__status-indicator'),
      statusText: this.container.querySelector('.gesture-panel__status-text'),
      gestureName: this.container.querySelector('.gesture-panel__gesture-name'),
      previewVideo: this.container.querySelector('.gesture-panel__preview-video'),
      previewCanvas: this.container.querySelector('.gesture-panel__preview-canvas'),
      fpsCounter: this.container.querySelector('.gesture-panel__fps-value'),
      startBtn: this.container.querySelector('.gesture-panel__btn--start'),
      stopBtn: this.container.querySelector('.gesture-panel__btn--stop'),
      closeBtn: this.container.querySelector('.gesture-panel__btn--close'),
      diagCamera: this.container.querySelector('.diag-camera'),
      diagMediapipe: this.container.querySelector('.diag-mediapipe'),
      diagHands: this.container.querySelector('.diag-hands'),
      diagLandmarks: this.container.querySelector('.diag-landmarks'),
      diagFingers: this.container.querySelector('.diag-fingers'),
      diagFingerStates: this.container.querySelector('.diag-finger-states'),
      diagPinch: this.container.querySelector('.diag-pinch'),
      diagGesture: this.container.querySelector('.diag-gesture'),
      diagAction: this.container.querySelector('.diag-action'),
      diagFps: this.container.querySelector('.diag-fps'),
      diagError: this.container.querySelector('.diag-error'),
    };
    this.previewCanvas = this.elements.previewCanvas;
    this.previewContext = this.previewCanvas?.getContext('2d', { willReadFrequently: true });
    this.setPanelOpen(false);
  }

  getPanelHTML() {
    return `
      <button class="gesture-panel__toggle" aria-label="Open Gesture Control" aria-expanded="false">
        <svg class="gesture-panel__icon" viewBox="0 0 24 24" width="24" height="24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg>
        <span class="gesture-panel__toggle-text">Gesture</span>
      </button>
      <div class="gesture-panel__content" hidden>
        <div class="gesture-panel__header">
          <h3 class="gesture-panel__title">Gesture Control</h3>
          <button class="gesture-panel__btn gesture-panel__btn--close" aria-label="Close"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>
        </div>
        <div class="gesture-panel__body">
          <div class="gesture-panel__preview-wrapper">
            ${this.options.showPreview ? '<video class="gesture-panel__preview-video" playsinline muted></video><canvas class="gesture-panel__preview-canvas"></canvas>' : ''}
            <div class="gesture-panel__status-overlay">
              <div class="gesture-panel__status-indicator" data-status="stopped"><span class="gesture-panel__status-dot"></span><span class="gesture-panel__status-text">Stopped</span></div>
              <div class="gesture-panel__gesture-indicator"><span class="gesture-panel__gesture-label">Gesture:</span><span class="gesture-panel__gesture-name" data-gesture="NEUTRAL">NEUTRAL</span></div>
            </div>
          </div>
          <div class="gesture-panel__controls">
            <div class="gesture-panel__btn-group">
              <button class="gesture-panel__btn gesture-panel__btn--primary gesture-panel__btn--start" disabled><svg viewBox="0 0 24 24" width="16" height="16"><path d="M8 5v14l11-7z"/></svg><span>Start</span></button>
              <button class="gesture-panel__btn gesture-panel__btn--secondary gesture-panel__btn--stop" disabled><svg viewBox="0 0 24 24" width="16" height="16"><path d="M6 6h12v12H6z"/></svg><span>Stop</span></button>
            </div>
            <div class="gesture-panel__fps"><span class="gesture-panel__fps-label">FPS:</span><span class="gesture-panel__fps-value">--</span></div>
          </div>
          ${this.options.showDiagnostics ? this.getDiagnosticsPanelHTML() : ''}
          <div class="gesture-panel__gesture-guide">
            <h4>Gestures</h4>
            <ul class="gesture-panel__gesture-list">
              <li data-gesture="STOP"><span class="gesture-panel__gesture-icon">✋</span><span class="gesture-panel__gesture-desc"><strong>STOP</strong> - 5 doigts ouverts</span></li>
              <li data-gesture="CLICK"><span class="gesture-panel__gesture-icon">🤏</span><span class="gesture-panel__gesture-desc"><strong>CLICK</strong> - Pince pouce + index</span></li>
              <li data-gesture="SCROLL"><span class="gesture-panel__gesture-icon">☝️✌️</span><span class="gesture-panel__gesture-desc"><strong>SCROLL</strong> - Index + majeur</span></li>
              <li data-gesture="CURSOR"><span class="gesture-panel__gesture-icon">☝️</span><span class="gesture-panel__gesture-desc"><strong>CURSOR</strong> - Index seul</span></li>
              <li data-gesture="NEUTRAL"><span class="gesture-panel__gesture-icon">✊</span><span class="gesture-panel__gesture-desc"><strong>NEUTRAL</strong> - Poing / rien</span></li>
            </ul>
          </div>
        </div>
      </div>
    `;
  }

  getDiagnosticsPanelHTML() {
    return `
      <div class="gesture-panel__diagnostics">
        <div class="gesture-panel__diag-header"><h4>Diagnostics</h4></div>
        <div class="gesture-panel__diag-grid">
          <div class="gesture-panel__diag-section"><h5>Pipeline</h5>
            <div class="gesture-panel__diag-row"><span class="gesture-panel__diag-label">Camera:</span><span class="gesture-panel__diag-value diag-camera" data-state="unknown">Unknown</span></div>
            <div class="gesture-panel__diag-row"><span class="gesture-panel__diag-label">Video Ready:</span><span class="gesture-panel__diag-value diag-video-ready" data-state="unknown">NO</span></div>
            <div class="gesture-panel__diag-row"><span class="gesture-panel__diag-label">Video:</span><span class="gesture-panel__diag-value diag-video-dimensions">0 × 0</span></div>
            <div class="gesture-panel__diag-row"><span class="gesture-panel__diag-label">Video FPS:</span><span class="gesture-panel__diag-value diag-fps">0</span></div>
          </div>
          <div class="gesture-panel__diag-section"><h5>Worker</h5>
            <div class="gesture-panel__diag-row"><span class="gesture-panel__diag-label">MediaPipe:</span><span class="gesture-panel__diag-value diag-mediapipe" data-state="unknown">Unknown</span></div>
            <div class="gesture-panel__diag-row"><span class="gesture-panel__diag-label">Landmarker:</span><span class="gesture-panel__diag-value diag-landmarker" data-state="unknown">Not Ready</span></div>
            <div class="gesture-panel__diag-row"><span class="gesture-panel__diag-label">Frames Received:</span><span class="gesture-panel__diag-value diag-frames-received">0</span></div>
            <div class="gesture-panel__diag-row"><span class="gesture-panel__diag-label">Frames Processed:</span><span class="gesture-panel__diag-value diag-frames-processed">0</span></div>
            <div class="gesture-panel__diag-row"><span class="gesture-panel__diag-label">Results:</span><span class="gesture-panel__diag-value diag-results-received">0</span></div>
          </div>
          <div class="gesture-panel__diag-section"><h5>Hand Analysis</h5>
            <div class="gesture-panel__diag-row"><span class="gesture-panel__diag-label">Hands:</span><span class="gesture-panel__diag-value diag-hands">0</span></div>
            <div class="gesture-panel__diag-row"><span class="gesture-panel__diag-label">Landmarks:</span><span class="gesture-panel__diag-value diag-landmarks">0/21</span></div>
            <div class="gesture-panel__diag-row"><span class="gesture-panel__diag-label">Extended:</span><span class="gesture-panel__diag-value diag-fingers">0/5</span></div>
            <div class="gesture-panel__diag-row"><span class="gesture-panel__diag-label">Fingers:</span><div class="gesture-panel__diag-finger-states diag-finger-states"><span data-finger="thumb">T</span><span data-finger="index">I</span><span data-finger="middle">M</span><span data-finger="ring">R</span><span data-finger="pinky">P</span></div></div>
            <div class="gesture-panel__diag-row"><span class="gesture-panel__diag-label">Pinch:</span><div class="gesture-panel__diag-pinch"><div class="gesture-panel__diag-pinch-bar diag-pinch"></div><span class="gesture-panel__diag-pinch-value">0.000</span></div></div>
          </div>
          <div class="gesture-panel__diag-section"><h5>Classification</h5>
            <div class="gesture-panel__diag-row"><span class="gesture-panel__diag-label">Gesture:</span><span class="gesture-panel__diag-value diag-gesture" data-gesture="NEUTRAL">NEUTRAL</span></div>
            <div class="gesture-panel__diag-row"><span class="gesture-panel__diag-label">Action:</span><span class="gesture-panel__diag-value diag-action">None</span></div>
          </div>
          <div class="gesture-panel__diag-section gesture-panel__diag-error-section"><h5>Errors</h5>
            <div class="gesture-panel__diag-row"><span class="gesture-panel__diag-value diag-error" style="grid-column: 1 / -1; text-align: center;">No errors</span></div>
          </div>
        </div>
      </div>
    `;
  }

  createStyles() {
    if (document.getElementById('gesture-ui-styles')) return;
    const style = document.createElement('style');
    style.id = 'gesture-ui-styles';
    style.textContent = this.getStyles();
    document.head.appendChild(style);
  }

  getStyles() {
    return `
      .gesture-panel { position: fixed; z-index: 10000; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; line-height: 1.4; --panel-bg: rgba(255,255,255,0.95); --panel-border: rgba(0,0,0,0.1); --panel-text: #1a1a1a; --panel-accent: #2563eb; --panel-accent-hover: #1d4ed8; --panel-danger: #dc2626; --panel-success: #16a34a; --panel-warning: #ea580c; --panel-shadow: 0 8px 32px rgba(0,0,0,0.12); --panel-radius: 12px; transition: transform .3s, opacity .3s; }
      @media (prefers-color-scheme: dark) { .gesture-panel:not(.gesture-panel--light) { --panel-bg: rgba(30,30,30,0.95); --panel-border: rgba(255,255,255,0.1); --panel-text: #f5f5f5; --panel-accent: #3b82f6; --panel-accent-hover: #60a5fa; --panel-shadow: 0 8px 32px rgba(0,0,0,0.4); } }
      .gesture-panel--light { --panel-bg: rgba(255,255,255,0.95); --panel-border: rgba(0,0,0,0.1); --panel-text: #1a1a1a; --panel-accent: #2563eb; --panel-accent-hover: #1d4ed8; }
      .gesture-panel--dark { --panel-bg: rgba(30,30,30,0.95); --panel-border: rgba(255,255,255,0.1); --panel-text: #f5f5f5; --panel-accent: #3b82f6; --panel-accent-hover: #60a5fa; }
      .gesture-panel--bottom-right { bottom: 20px; right: 20px; } .gesture-panel--bottom-left { bottom: 20px; left: 20px; } .gesture-panel--top-right { top: 20px; right: 20px; } .gesture-panel--top-left { top: 20px; left: 20px; }
      .gesture-panel__toggle { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: var(--panel-bg); border: 1px solid var(--panel-border); border-radius: 50px; color: var(--panel-text); cursor: pointer; box-shadow: var(--panel-shadow); backdrop-filter: blur(10px); transition: all .2s; }
      .gesture-panel__toggle:hover { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(0,0,0,0.15); }
      .gesture-panel__icon { color: var(--panel-accent); } .gesture-panel__toggle-text { font-weight: 500; }
      .gesture-panel__content { position: absolute; bottom: 100%; right: 0; margin-bottom: 12px; width: 360px; background: var(--panel-bg); border: 1px solid var(--panel-border); border-radius: var(--panel-radius); box-shadow: var(--panel-shadow); backdrop-filter: blur(10px); overflow: hidden; opacity: 0; transform: translateY(10px); pointer-events: none; transition: opacity .2s, transform .2s; }
      .gesture-panel--bottom-left .gesture-panel__content, .gesture-panel--top-left .gesture-panel__content { right: auto; left: 0; }
      .gesture-panel--top-right .gesture-panel__content, .gesture-panel--top-left .gesture-panel__content { bottom: auto; top: 100%; margin-bottom: 0; margin-top: 12px; transform: translateY(-10px); }
      .gesture-panel__content[hidden] { display: none; } .gesture-panel__content:not([hidden]) { opacity: 1; transform: translateY(0); pointer-events: auto; }
      .gesture-panel__header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--panel-border); }
      .gesture-panel__title { margin: 0; font-size: 14px; font-weight: 600; color: var(--panel-text); }
      .gesture-panel__btn { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 12px; border: none; border-radius: 8px; font-size: 12px; font-weight: 500; cursor: pointer; transition: all .15s; }
      .gesture-panel__btn:focus-visible { outline: 2px solid var(--panel-accent); outline-offset: 2px; }
      .gesture-panel__btn--primary { background: var(--panel-accent); color: white; }
      .gesture-panel__btn--primary:hover:not(:disabled) { background: var(--panel-accent-hover); }
      .gesture-panel__btn--secondary { background: transparent; color: var(--panel-text); }
      .gesture-panel__btn--secondary:hover:not(:disabled) { background: rgba(0,0,0,0.05); }
      .gesture-panel--dark .gesture-panel__btn--secondary:hover:not(:disabled) { background: rgba(255,255,255,0.1); }
      .gesture-panel__btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .gesture-panel__btn--close { padding: 8px; background: transparent; color: var(--panel-text); }
      .gesture-panel__btn--close:hover { background: rgba(0,0,0,0.05); }
      .gesture-panel__body { padding: 12px 16px; }
      .gesture-panel__preview-wrapper { position: relative; width: 100%; aspect-ratio: 4/3; border-radius: 8px; overflow: hidden; background: #000; margin-bottom: 12px; }
      .gesture-panel__preview-video, .gesture-panel__preview-canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; }
      .gesture-panel__preview-video { transform: scaleX(-1); }
      .gesture-panel__status-overlay { position: absolute; top: 8px; left: 8px; right: 8px; display: flex; flex-direction: column; gap: 6px; pointer-events: none; }
      .gesture-panel__status-indicator { display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: rgba(0,0,0,0.7); border-radius: 20px; color: white; font-size: 11px; font-weight: 500; backdrop-filter: blur(4px); }
      .gesture-panel__status-dot { width: 8px; height: 8px; border-radius: 50%; background: #ef4444; transition: background .3s; }
      .gesture-panel__status-indicator[data-status="running"] .gesture-panel__status-dot { background: #22c55e; animation: gesture-pulse 1.5s infinite; }
      .gesture-panel__status-indicator[data-status="initializing"] .gesture-panel__status-dot, .gesture-panel__status-indicator[data-status="ready"] .gesture-panel__status-dot { background: #f59e0b; }
      .gesture-panel__status-indicator[data-status="error"] .gesture-panel__status-dot { background: #ef4444; }
      @keyframes gesture-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
      .gesture-panel__gesture-indicator { display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: rgba(0,0,0,0.7); border-radius: 20px; color: white; font-size: 11px; backdrop-filter: blur(4px); }
      .gesture-panel__gesture-name { font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; min-width: 70px; text-align: right; }
      .gesture-panel__gesture-name[data-gesture="STOP"] { color: #fca5a5; } .gesture-panel__gesture-name[data-gesture="CLICK"] { color: #fcd34d; }
      .gesture-panel__gesture-name[data-gesture="SCROLL"] { color: #60a5fa; } .gesture-panel__gesture-name[data-gesture="CURSOR"] { color: #a78bfa; }
      .gesture-panel__gesture-name[data-gesture="NEUTRAL"] { color: #9ca3af; }
      .gesture-panel__controls { display: flex; align-items: center; justify-content: space-between; }
      .gesture-panel__btn-group { display: flex; gap: 8px; }
      .gesture-panel__fps { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--panel-text); opacity: 0.7; }
      .gesture-panel__fps-value { font-variant-numeric: tabular-nums; font-weight: 600; color: var(--panel-accent); }
      .gesture-panel__diagnostics { border-top: 1px solid var(--panel-border); background: rgba(0,0,0,0.03); margin: 0 -16px -16px; padding: 12px 16px 16px; }
      .gesture-panel--dark .gesture-panel__diagnostics { background: rgba(255,255,255,0.03); }
      .gesture-panel__diag-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
      .gesture-panel__diag-header h4 { margin: 0; font-size: 12px; font-weight: 600; color: var(--panel-text); text-transform: uppercase; letter-spacing: 0.5px; }
      .gesture-panel__diag-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
      .gesture-panel__diag-section { background: var(--panel-bg); border: 1px solid var(--panel-border); border-radius: 8px; padding: 12px; }
      .gesture-panel__diag-section h5 { margin: 0 0 10px; font-size: 11px; font-weight: 600; color: var(--panel-text); opacity: 0.7; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid var(--panel-border); padding-bottom: 8px; }
      .gesture-panel__diag-row { display: grid; grid-template-columns: auto 1fr; gap: 8px 12px; align-items: center; padding: 6px 0; font-size: 11px; border-bottom: 1px solid var(--panel-border); }
      .gesture-panel__diag-row:last-child { border-bottom: none; }
      .gesture-panel__diag-label { color: var(--panel-text); opacity: 0.7; white-space: nowrap; font-size: 10px; }
      .gesture-panel__diag-value { color: var(--panel-text); font-weight: 500; font-variant-numeric: tabular-nums; text-align: right; }
      .gesture-panel__diag-value[data-state="unknown"] { color: #9ca3af; }
      .gesture-panel__diag-value[data-state="requesting"] { color: #f59e0b; }
      .gesture-panel__diag-value[data-state="loading"] { color: #f59e0b; }
      .gesture-panel__diag-value[data-state="active"] { color: #22c55e; }
      .gesture-panel__diag-value[data-state="ready"] { color: #22c55e; }
      .gesture-panel__diag-value[data-state="error"] { color: #ef4444; }
      .gesture-panel__diag-finger-states { display: flex; gap: 4px; justify-content: flex-end; }
      .gesture-panel__diag-finger { width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; background: var(--panel-border); border-radius: 4px; font-size: 9px; font-weight: 600; color: var(--panel-text); opacity: 0.4; transition: all .15s; }
      .gesture-panel__diag-finger.active { background: var(--panel-accent); color: white; opacity: 1; }
      .gesture-panel__diag-pinch { display: flex; align-items: center; gap: 8px; flex: 1; }
      .gesture-panel__diag-pinch-bar { flex: 1; max-width: 100px; height: 5px; background: var(--panel-border); border-radius: 3px; overflow: hidden; }
      .gesture-panel__diag-pinch-bar > div { height: 100%; background: linear-gradient(90deg, var(--panel-success), var(--panel-warning), var(--panel-danger)); border-radius: 3px; transition: width .1s; }
      .gesture-panel__diag-pinch-value { font-variant-numeric: tabular-nums; font-size: 10px; color: var(--panel-text); opacity: 0.7; white-space: nowrap; min-width: 40px; text-align: right; }
      .gesture-panel__diag-value[data-gesture="STOP"] { color: #fca5a5; } .gesture-panel__diag-value[data-gesture="CLICK"] { color: #fcd34d; }
      .gesture-panel__diag-value[data-gesture="SCROLL"] { color: #60a5fa; } .gesture-panel__diag-value[data-gesture="CURSOR"] { color: #a78bfa; }
      .gesture-panel__diag-value[data-gesture="NEUTRAL"] { color: #9ca3af; }
      .gesture-panel__diag-error-section { grid-column: 1 / -1; }
      .gesture-panel__diag-error-section .gesture-panel__diag-row { border-bottom: none; }
      .gesture-panel__gesture-guide { padding: 0 16px 16px; border-top: 1px solid var(--panel-border); }
      .gesture-panel__gesture-guide h4 { margin: 12px 0 8px; font-size: 12px; font-weight: 600; color: var(--panel-text); text-transform: uppercase; letter-spacing: 0.5px; }
      .gesture-panel__gesture-list { list-style: none; margin: 0; padding: 0; }
      .gesture-panel__gesture-item { display: flex; align-items: center; gap: 10px; padding: 6px 0; font-size: 11px; color: var(--panel-text); opacity: 0.8; transition: opacity .2s; }
      .gesture-panel__gesture-item.active { opacity: 1; font-weight: 500; }
      .gesture-panel__gesture-icon { font-size: 14px; width: 22px; text-align: center; }
      .gesture-panel__gesture-desc { flex: 1; }
      #gesture-virtual-cursor { position: fixed; top: 0; left: 0; width: 24px; height: 24px; pointer-events: none; z-index: 9999; transform: translate(-50%, -50%); transition: transform .016s linear; }
      #gesture-virtual-cursor::before { content: ''; position: absolute; top: 50%; left: 50%; width: 16px; height: 16px; border: 2px solid var(--panel-accent); border-radius: 50%; transform: translate(-50%, -50%); background: rgba(37,99,235,0.1); box-shadow: 0 0 0 2px rgba(255,255,255,0.8), 0 2px 8px rgba(0,0,0,0.2); }
      #gesture-virtual-cursor::after { content: ''; position: absolute; top: 50%; left: 50%; width: 4px; height: 4px; background: var(--panel-accent); border-radius: 50%; transform: translate(-50%, -50%); }
      #gesture-virtual-cursor.clicking::before { transform: translate(-50%, -50%) scale(0.7); border-color: var(--panel-success); background: rgba(22,163,74,0.2); }
      .gesture-clicked { animation: gesture-click-flash .15s ease; }
      @keyframes gesture-click-flash { 0% { outline: 2px solid var(--panel-success); outline-offset: 2px; } 100% { outline: none; } }
      .gesture-hover { outline: 2px solid var(--panel-accent) !important; outline-offset: 2px !important; box-shadow: 0 0 0 4px rgba(37,99,235,0.2) !important; transition: outline .1s, box-shadow .1s; }
      @media (prefers-reduced-motion: reduce) { .gesture-hover { transition: none !important; } }
      @media (prefers-reduced-motion: reduce) { .gesture-panel, .gesture-panel__toggle, .gesture-panel__content, .gesture-panel__status-dot, #gesture-virtual-cursor { animation: none !important; transition: none !important; } }
      @media (max-width: 480px) { .gesture-panel__content { width: calc(100vw - 40px); max-width: 360px; } .gesture-panel__toggle-text { display: none; } .gesture-panel__toggle { padding: 10px; } .gesture-panel__diag-grid { grid-template-columns: 1fr; } }
    `;
  }

  attachEventListeners() {
    this.elements.toggleBtn?.addEventListener('click', () => this.togglePanel());
    this.elements.closeBtn?.addEventListener('click', () => this.setPanelOpen(false));
    this.elements.startBtn?.addEventListener('click', async () => {
      try { await this.controller.init(); this.controller.start(); this.updateButtons(); }
      catch (e) { this.showError(e.message); }
    });
    this.elements.stopBtn?.addEventListener('click', () => { this.controller.stop(); this.updateButtons(); });
  }

  togglePanel() { this.setPanelOpen(!this.isPanelOpen); }

  setPanelOpen(open) {
    this.isPanelOpen = open;
    if (this.elements.panel) this.elements.panel.hidden = !open;
    this.elements.toggleBtn?.setAttribute('aria-expanded', open);
    if (open) { if (!this.controller.isInitialized && !this.controller.isRunning) this.initializeController(); this.startPreviewRender(); }
    else this.stopPreviewRender();
  }

  async initializeController() {
    try {
      this.updateDiagCamera('requesting'); this.updateButtons();
      await this.controller.init(); this.controller.start();
      this.updateButtons(); this.updateDiagCamera('active');
    } catch (e) { this.updateDiagCamera('error'); this.controller.options.onError(e); this.updateButtons(); }
  }

  updateButtons() {
    const s = this.controller.getStatus();
    const running = s.isRunning, init = s.isInitialized, initializing = !init && !running && this.controller.worker;
    if (this.elements.startBtn) {
      if (initializing) { this.elements.startBtn.disabled = true; this.elements.startBtn.querySelector('span').textContent = 'Initializing...'; }
      else { this.elements.startBtn.disabled = running || !init; this.elements.startBtn.querySelector('span').textContent = running ? 'Running' : 'Start'; }
    }
    if (this.elements.stopBtn) this.elements.stopBtn.disabled = !running;
  }

  startPreviewRender() {
    if (!this.options.showPreview || !this.previewCanvas || !this.controller.videoElement) return;
    const render = () => {
      if (!this.isPanelOpen) return;
      const v = this.controller.videoElement;
      if (v && v.readyState === v.HAVE_ENOUGH_DATA) {
        this.previewCanvas.width = v.videoWidth; this.previewCanvas.height = v.videoHeight;
        this.previewContext.save(); this.previewContext.scale(-1, 1); this.previewContext.drawImage(v, -v.videoWidth, 0); this.previewContext.restore();
        if (this.lastLandmarks && this.options.showLandmarks) this.drawLandmarks(this.lastLandmarks);
      }
      this.animationFrameId = requestAnimationFrame(render);
    };
    render();
  }

  stopPreviewRender() { if (this.animationFrameId) { cancelAnimationFrame(this.animationFrameId); this.animationFrameId = null; } }

  drawLandmarks(lm) {
    const ctx = this.previewContext, w = this.previewCanvas.width, h = this.previewCanvas.height;
    const conn = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,5],[0,17]];
    ctx.strokeStyle = 'rgba(37,99,235,0.8)'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); for (const [i,j] of conn) if (lm[i] && lm[j]) { ctx.moveTo(w - lm[i].x * w, lm[i].y * h); ctx.lineTo(w - lm[j].x * w, lm[j].y * h); } ctx.stroke();
    ctx.fillStyle = '#22c55e'; for (const p of lm) { ctx.beginPath(); ctx.arc(w - p.x * w, p.y * h, 4, 0, Math.PI * 2); ctx.fill(); }
    if (lm[8]) { ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.arc(w - lm[8].x * w, lm[8].y * h, 8, 0, Math.PI * 2); ctx.fill(); }
  }

  onGestureChange(info) {
    this.updateGestureIndicator(info); this.updateGestureGuide(info.gesture); this.updateDiagGesture(info.gesture); this.updateDiagAction(info);
  }

  updateGestureIndicator(info) {
    const el = this.elements.gestureName; if (!el) return;
    el.textContent = info.gesture; el.dataset.gesture = info.gesture;
    this.updateDiagFingerStates(info.fingerStates); this.updateDiagPinch(info.pinchDistance);
  }

  updateGestureGuide(active) { this.container.querySelectorAll('.gesture-panel__gesture-item').forEach(it => it.classList.toggle('active', it.dataset.gesture === active)); }

  updateDiagCamera(state) { const el = this.elements.diagCamera; if (!el) return; const m = { unknown: 'Unknown', requesting: 'Requesting...', active: 'Active', error: 'Error' }; el.textContent = m[state] || state; el.dataset.state = state; }
  updateDiagMediapipe(state) { const el = this.elements.diagMediapipe; if (!el) return; const m = { unknown: 'Unknown', loading: 'Loading...', ready: 'Ready', error: 'Error' }; el.textContent = m[state] || state; el.dataset.state = state; }
  updateDiagLandmarker(state) { const el = this.container.querySelector('.diag-landmarker'); if (!el) return; el.textContent = state; el.dataset.state = state === 'Ready' ? 'ready' : 'unknown'; }

  updateDiagHands(c) { const el = this.elements.diagHands; if (el) el.textContent = c; }
  updateDiagLandmarks(c) { const el = this.elements.diagLandmarks; if (el) el.textContent = `${c}/21`; }
  updateDiagFingers(c) { const el = this.elements.diagFingers; if (el) el.textContent = `${c}/5`; }
  updateDiagFingerStates(states) { if (!states) return; const c = this.elements.diagFingerStates; if (!c) return; ['thumb','index','middle','ring','pinky'].forEach((l,i) => { const el = c.querySelector(`[data-finger="${l}"]`); if (el) el.classList.toggle('active', states[i]); }); this.updateDiagFingers(states.filter(s=>s).length); }
  updateDiagPinch(d) { if (typeof d !== 'number') return; const bar = this.container.querySelector('.gesture-panel__diag-pinch-bar > div'), val = this.container.querySelector('.gesture-panel__diag-pinch-value'), el = this.elements.diagPinch; if (bar) { const p = Math.max(0, Math.min(100, (1 - d / 0.15) * 100)); bar.style.width = `${p}%`; } if (val) val.textContent = d.toFixed(3); if (el) el.textContent = d.toFixed(3); }
  updateDiagGesture(g) { const el = this.elements.diagGesture; if (!el) return; el.textContent = g; el.dataset.gesture = g; }
  updateDiagAction(info) { const el = this.elements.diagAction; if (!el) return; let a = 'None'; if (info.isClickTriggered) a = 'Click'; else if (info.isClickReleased) a = 'Click Released'; else if (info.gesture === 'SCROLL' && Math.abs(info.scrollVelocity) > 0.5) a = `Scroll ${info.scrollVelocity > 0 ? 'Down' : 'Up'}`; else if (info.gesture === 'CURSOR') a = 'Cursor Tracking'; else if (info.gesture === 'STOP') a = 'Emergency Stop'; else if (info.isStopTriggered) a = 'Stop Triggered'; el.textContent = a; }
  updateDiagFps(f) { const el = this.elements.diagFps; if (el) el.textContent = f.toFixed(1); if (this.elements.fpsCounter) this.elements.fpsCounter.textContent = f.toFixed(1); }
  updateDiagError(msg) { const el = this.elements.diagError; if (!el) return; if (msg) { el.textContent = msg; el.style.color = 'var(--panel-danger)'; } else { el.textContent = 'No errors'; el.style.color = 'var(--panel-text)'; el.style.opacity = '0.5'; } }

  onStatusChange(status) {
    const ind = this.container.querySelector('.gesture-panel__status-indicator'), txt = this.container.querySelector('.gesture-panel__status-text');
    if (ind) ind.dataset.status = status;
    if (txt) { const m = { stopped: 'Stopped', initializing: 'Initializing...', ready: 'Ready', running: 'Running', error: 'Error' }; txt.textContent = m[status] || status; }
    if (status === 'initializing') this.updateDiagMediapipe('loading');
    else if (status === 'ready') this.updateDiagMediapipe('ready');
    else if (status === 'running') this.updateDiagMediapipe('ready');
    else if (status === 'error') { this.updateDiagMediapipe('error'); this.updateDiagCamera('error'); }
    this.updateButtons();
  }

  onError(e) { const m = e.message || 'Error'; this.showError(m); this.updateDiagError(m); }

  onDebugData(d) {
    if (d.type === 'DIAG_UPDATE') { this.updateWorkerDiag(d); return; }
    if (d.type === 'VIDEO_DIAG') { this.updateVideoDiag(d); return; }
    if (d.landmarks) { this.lastLandmarks = d.landmarks; this.updateDiagLandmarks(d.landmarks.length); this.updateDiagHands(1); }
    if (typeof d.fps === 'number') this.updateDiagFps(d.fps);
    if (d.gesture === 'NO_HAND') { this.updateDiagHands(0); this.updateDiagLandmarks(0); this.updateDiagFingers(0); this.updateDiagFingerStates([false,false,false,false,false]); this.updateDiagPinch(1); this.updateDiagGesture('NO_HAND'); this.updateDiagAction({ gesture: 'NO_HAND' }); }
  }

  updateVideoDiag(d) {
    const rel = this.container.querySelector('.diag-video-ready'); if (rel) { rel.textContent = d.videoReady ? 'YES' : 'NO'; rel.dataset.state = d.videoReady ? 'active' : 'error'; }
    const dim = this.container.querySelector('.diag-video-dimensions'); if (dim) dim.textContent = `${d.videoWidth} × ${d.videoHeight}`;
    if (typeof d.fps === 'number') this.updateDiagFps(d.fps);
  }

  updateWorkerDiag(d) {
    if (d.visionLoaded) this.updateDiagMediapipe('loading');
    if (d.landmarkerCreated) this.updateDiagMediapipe('loading');
    if (d.landmarkerInitialized) { this.updateDiagMediapipe('ready'); this.updateDiagLandmarker('Ready'); }
    if (d.lastError) { this.updateDiagError(d.lastError); this.updateDiagMediapipe('error'); }
    if (d.framesReceived !== undefined) { const el = this.container.querySelector('.diag-frames-received'); if (el) el.textContent = d.framesReceived; }
    if (d.framesProcessed !== undefined) { const el = this.container.querySelector('.diag-frames-processed'); if (el) el.textContent = d.framesProcessed; }
    if (d.resultsReceived !== undefined) { const el = this.container.querySelector('.diag-results-received'); if (el) el.textContent = d.resultsReceived; }
  }

  showError(msg) {
    const toast = document.createElement('div'); toast.className = 'gesture-toast gesture-toast--error'; toast.setAttribute('role', 'alert'); toast.textContent = msg;
    Object.assign(toast.style, { position: 'fixed', bottom: '100px', right: '20px', padding: '12px 16px', background: '#dc2626', color: 'white', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.2)', zIndex: '10001', fontSize: '13px', maxWidth: '300px' });
    if (!document.getElementById('gesture-toast-styles')) { const st = document.createElement('style'); st.id = 'gesture-toast-styles'; st.textContent = `.gesture-toast { animation: toast-in .3s ease; } @keyframes toast-in { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }`; document.head.appendChild(st); }
    document.body.appendChild(toast); setTimeout(() => { toast.style.animation = 'toast-out .3s ease forwards'; setTimeout(() => toast.remove(), 300); }, 4000);
  }

  updateTheme() { const dark = window.matchMedia('(prefers-color-scheme: dark)').matches; this.container.classList.toggle('gesture-panel--dark', dark); this.container.classList.toggle('gesture-panel--light', !dark); }

  destroy() { this.stopPreviewRender(); this.container?.remove(); document.getElementById('gesture-ui-styles')?.remove(); document.getElementById('gesture-toast-styles')?.remove(); }
}

export default GestureUI;