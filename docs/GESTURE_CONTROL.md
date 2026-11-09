# Gesture Control System

A webcam-based gesture control system for navigating the UNSEPTZEROTROIS portfolio website using hand gestures. No mouse or keyboard required.

## Features

- **5 Gesture Types**: STOP, CLICK, SCROLL, CURSOR, NEUTRAL
- **Real-time Processing**: Runs entirely in-browser using MediaPipe Tasks Vision
- **Privacy-First**: No video data leaves the browser, no cloud dependencies
- **Smooth Control**: One Euro Filter for adaptive cursor smoothing
- **Priority System**: Gesture hierarchy with hysteresis to prevent flickering
- **Accessible**: Keyboard shortcut (G key), screen reader support

## Quick Start

1. Open the portfolio website
2. Click the **Gesture Control** button in the navbar (or press `G` key)
3. Click **Start** in the panel
4. Allow camera permission when prompted
5. Use hand gestures to navigate

## Gestures

| Gesture | Hand Pose | Action | Priority |
|---------|-----------|--------|----------|
| **STOP** | ✋ All 5 fingers extended | Emergency stop, reset cursor | Highest |
| **CLICK** | 🤏 Pinch thumb + index | Click element at cursor | High |
| **SCROLL** | ☝️✌️ Index + middle extended | Scroll page up/down | Medium |
| **CURSOR** | ☝️ Index finger only | Move virtual cursor | Low |
| **NEUTRAL** | ✊ Fist / no gesture | No action | Lowest |

## How It Works

### Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Main Thread   │────▶│   Web Worker     │────▶│  MediaPipe      │
│  (gesture-      │     │  (gesture-       │     │  HandLandmarker │
│   controller)   │     │   worker)        │     │  (Tasks Vision) │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                        │                        │
        ▼                        ▼                        ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  UI & Actions   │     │  Gesture         │     │  21 Hand        │
│  (gesture-ui)   │     │  Classification  │     │  Landmarks      │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

### Gesture Priority & Hysteresis

The system uses a priority-based finite state machine:

1. **STOP** (5 fingers) - Always wins, exits only after transition delay
2. **CLICK** (pinch) - Beats SCROLL and CURSOR
3. **SCROLL** (2 fingers) - Beats CURSOR and NEUTRAL
4. **CURSOR** (1 finger) - Only beats NEUTRAL
5. **NEUTRAL** - Default state

Hysteresis prevents flickering:
- **Hold frames**: Gesture must be held for 3 frames before activating
- **Transition delay**: 5 frames before leaving STOP gesture

### Cursor Smoothing

Uses the **One Euro Filter** (Casiez et al., 2012):
- Adapts cutoff frequency based on velocity
- Low speed = heavy smoothing (removes jitter)
- High speed = responsive (follows fast movements)
- Max jump limit prevents cursor teleportation

## Configuration

The system can be configured via the `initGestureControl()` options:

```javascript
import { initGestureControl } from '/gesture-control/index.js';

await initGestureControl({
  // Camera settings
  cameraWidth: 640,
  cameraHeight: 480,
  cameraFps: 30,
  
  // Gesture settings
  mirrorHorizontal: true,
  controlRegionRatio: 0.8,    // Use central 80% of frame
  cursorSpeed: 1.5,           // Cursor sensitivity multiplier
  maxCursorJump: 50,          // Max pixels per frame
  scrollSpeed: 3.0,           // Scroll velocity multiplier
  clickCooldown: 500,         // Min ms between clicks
  
  // One Euro Filter
  oeFrequency: 60,
  oeMincutoff: 1.0,
  oeBeta: 0.0,
  oeDcutoff: 1.0,
  
  // UI
  uiPosition: 'bottom-right',
  uiTheme: 'auto',
  showDebug: false,
  
  // Callbacks
  onReady: ({ controller, ui }) => {},
  onError: (err) => {},
  onGestureChange: (gestureInfo) => {},
});
```

## Browser Support

| Browser | Support |
|---------|---------|
| Chrome 88+ | ✅ Full |
| Firefox 78+ | ✅ Full |
| Safari 14+ | ✅ Full |
| Edge 88+ | ✅ Full |

Requires:
- WebRTC `getUserMedia` (camera access)
- Web Workers
- OffscreenCanvas / ImageBitmap (for frame transfer)
- WASM support (for MediaPipe)

## Security & Privacy

- **No video recording**: Camera stream is processed in-memory only
- **No data transfer**: All processing happens locally in the browser
- **Explicit permission**: Camera access requires user consent
- **Cleanup on disable**: Camera stream stops, worker terminates
- **No cookies/storage**: No persistent data stored

## Performance

Target budget: **< 16ms/frame** (60 FPS)

| Component | Target |
|-----------|--------|
| MediaPipe Inference | ~8-12ms |
| Gesture Classification | <1ms |
| Main Thread Overhead | <2ms |
| UI Rendering | <2ms |

Optimizations:
- Web Worker offloads MediaPipe from main thread
- Frame throttling (configurable FPS)
- Transferable ImageBitmap for zero-copy frame transfer
- Lazy-loaded MediaPipe bundle (~2MB)
- GPU delegate with CPU fallback

## Troubleshooting

### Camera not working
- Check browser permissions (lock icon in address bar)
- Ensure no other app is using the camera
- Try refreshing the page

### Gestures not recognized
- Ensure good lighting on hand
- Keep hand within camera frame
- Use central 80% of frame (control region)
- Avoid busy backgrounds

### Poor performance
- Reduce camera resolution (640x480 default)
- Lower FPS setting
- Close other CPU-intensive tabs
- Ensure hardware acceleration is enabled

### Lenis scroll not smooth
- Ensure Lenis is initialized before gesture control
- Check `window.lenis` is available globally

## Development

### File Structure

```
gesture-control/
├── index.js              # Main entry point
├── gesture-controller.js # Main thread controller
├── gesture-worker.js     # Web Worker (MediaPipe)
├── gesture-ui.js         # UI panel component
├── one-euro-filter.js    # Smoothing filter
└── gesture-styles.css    # Panel styles (injected)
```

### Adding Custom Gestures

1. Add gesture type to `GestureType` enum in `gesture-worker.js`
2. Add classification logic in `classifyRawGesture()`
3. Add priority handling in `applyPriorityAndHysteresis()`
4. Add action execution in `gesture-controller.js` `executeGesture()`

### Testing

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## License

Part of UNSEPTZEROTROIS Portfolio Project.