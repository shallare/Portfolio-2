# Gesture Control Python

**Standalone hand gesture recognition system for controlling mouse cursor, clicks, and scrolling via webcam.**

Built with **MediaPipe**, **OpenCV**, and **PyAutoGUI**. Runs entirely locally - no cloud dependencies.

---

## ✨ Features

| Gesture | Configuration | Action | Priority |
|---------|---------------|--------|----------|
| 🛑 **STOP** | All 5 fingers open | Emergency stop - halts all actions, resets cursor | 1 (Highest) |
| 👌 **CLICK** | Pinch thumb + index | Left click on element under cursor | 2 |
| 📜 **SCROLL** | Index + middle extended | Scroll up/down by moving hand vertically | 3 |
| 👆 **CURSOR** | Index finger only | Move mouse cursor to index tip | 4 |
| ⚪ **NEUTRAL** | Any other pose | No action | 5 (Lowest) |

### Key Features
- ✅ **Real-time** hand tracking (21 landmarks via MediaPipe)
- ✅ **Priority-based** gesture system with hysteresis (no flickering)
- ✅ **Smooth cursor** via One Euro Filter (adaptive smoothing)
- ✅ **Configurable** sensitivity, speed, thresholds via `config.py` or env vars
- ✅ **Safety**: Emergency stop gesture, pyautogui fail-safe, graceful shutdown
- ✅ **No cloud** - 100% local processing
- ✅ **Cross-platform**: Linux, macOS, Windows

---

## 📦 Installation

### Prerequisites
- Python **3.10+** (tested on 3.10, 3.11, 3.12)
- Webcam
- **Linux**: `libglib2.0-0`, `libsm6`, `libxext6`, `libxrender-dev`, `libgl1-mesa-glx`
- **macOS**: Works natively
- **Windows**: Works natively

### Quick Start

```bash
# Clone or navigate to the project
cd gesture-control-python

# Create virtual environment (recommended)
python -m venv venv
source venv/bin/activate  # Linux/macOS
# venv\Scripts\activate   # Windows

# Install dependencies
pip install -r requirements.txt

# Run
python main.py
```

### Dependencies
```txt
opencv-python>=4.8.0
mediapipe>=0.10.9
pyautogui>=0.9.54
numpy>=1.24.0
```

---

## ⚙️ Configuration

All settings in `config.py` can be overridden via environment variables:

### Camera
```bash
CAMERA_INDEX=0           # Camera device index (0, 1, 2...)
CAMERA_WIDTH=640         # Frame width
CAMERA_HEIGHT=480        # Frame height
CAMERA_FPS=30            # Target FPS
```

### MediaPipe
```bash
MODEL_COMPLEXITY=1       # 0=lite, 1=full (more accurate)
MAX_NUM_HANDS=1          # Max hands to track
MIN_DETECTION_CONFIDENCE=0.7
MIN_TRACKING_CONFIDENCE=0.5
```

### Gesture Recognition
```bash
FINGER_EXTENSION_THRESHOLD=0.5     # Finger extension sensitivity
THUMB_EXTENSION_THRESHOLD=0.4      # Thumb extension sensitivity
PINCH_THRESHOLD=0.05               # Pinch detection threshold (normalized)
GESTURE_HOLD_FRAMES=3              # Frames to hold before activation
GESTURE_TRANSITION_DELAY=5         # Frames before gesture transition
```

### Mouse Control
```bash
MIRROR_HORIZONTAL=true      # Mirror webcam for natural interaction
CONTROL_REGION_RATIO=0.8    # Fraction of frame used for cursor (0.8 = center 80%)
CURSOR_SPEED=1.5            # Cursor speed multiplier
MAX_CURSOR_JUMP=50          # Max pixels per frame (prevents jumps)

# One Euro Filter (cursor smoothing)
OE_FREQUENCY=60.0
OE_MINCUTOFF=1.0
OE_BETA=0.0
OE_DCUTOFF=1.0
```

### Scroll Control
```bash
SCROLL_SPEED=3.0                    # Scroll speed multiplier
SCROLL_MOVEMENT_THRESHOLD=0.02      # Min hand movement to trigger scroll
SCROLL_SMOOTHING=0.3                # Velocity smoothing factor
```

### Click Control
```bash
CLICK_COOLDOWN=0.5          # Min seconds between clicks
PINCH_HOLD_FRAMES=2         # Frames pinch must be held before click
```

### Safety
```bash
EMERGENCY_STOP_HOLD_FRAMES=5    # Frames to hold STOP gesture
NO_HAND_TIMEOUT_FRAMES=60       # Frames before no-hand timeout
PYAUTOGUI_FAILSAFE=true         # Keep pyautogui corner failsafe enabled
```

### Display
```bash
SHOW_DEBUG=true         # Show landmark overlay and debug panel
SHOW_FPS=true           # Show FPS counter
```

---

## 🎮 Usage

### Starting
```bash
python main.py
```

### Controls
| Key | Action |
|-----|--------|
| `q` / `ESC` | Quit application |
| `d` | Toggle debug overlay |
| `r` | Reset cursor to screen center |
| `h` | Show help |

### Gesture Guide

#### 🛑 STOP (Emergency)
- **Pose**: All 5 fingers fully extended, palm facing camera
- **Effect**: Immediately stops all actions, centers cursor, clears gesture state
- **Priority**: Highest - interrupts any other gesture

#### 👌 CLICK
- **Pose**: Thumb tip touching index tip (pinch), other fingers folded
- **Effect**: Single left click at current cursor position
- **Anti-double-click**: 0.5s cooldown between clicks

#### 📜 SCROLL
- **Pose**: Index + middle fingers extended, others folded
- **Action**: Move hand **up** → scroll **down** | Move hand **down** → scroll **up**
- **Speed**: Proportional to hand movement velocity

#### 👆 CURSOR
- **Pose**: Only index finger extended
- **Action**: Cursor follows index fingertip
- **Smoothing**: One Euro Filter adapts to speed (smooth at rest, responsive when moving)

---

## 🏗️ Architecture

```
gesture-control-python/
├── main.py                 # Entry point, main loop
├── config.py               # All configuration (env-overridable)
├── hand_tracking.py        # MediaPipe Hands wrapper
├── gesture_recognition.py  # 5-gesture classifier + priority FSM
├── one_euro_filter.py      # Adaptive cursor smoothing
├── mouse_controller.py     # PyAutoGUI cursor/click control
├── scroll_controller.py    # Smooth scroll handling
├── requirements.txt        # Dependencies
├── .gitignore
└── README.md
```

### Data Flow
```
Webcam → HandTracker (MediaPipe) → GestureRecognizer (FSM)
                                          ↓
                    ┌─────────────────────┼─────────────────────┐
                    ▼                     ▼                     ▼
            MouseController         ScrollController       Emergency Stop
            (cursor + click)         (velocity scroll)      (reset all)
```

---

## 🔧 Troubleshooting

### Camera not detected
```bash
# List available cameras (Linux)
v4l2-ctl --list-devices

# Try different index
CAMERA_INDEX=1 python main.py
```

### Low FPS / Lag
- Reduce `CAMERA_WIDTH`/`CAMERA_HEIGHT` (e.g., 320x240)
- Set `MODEL_COMPLEXITY=0` (lite model)
- Ensure good lighting

### Cursor jittery
- Increase `OE_MINCUTOFF` (more smoothing)
- Increase `CONTROL_REGION_RATIO` (larger control area)
- Check `MIRROR_HORIZONTAL` setting

### Click not registering
- Decrease `PINCH_THRESHOLD` (easier pinch)
- Increase `PINCH_HOLD_FRAMES`
- Ensure thumb/index tips clearly touch

### Scroll too sensitive/fast
- Decrease `SCROLL_SPEED`
- Increase `SCROLL_MOVEMENT_THRESHOLD`
- Increase `SCROLL_SMOOTHING`

### Permission errors (Linux)
```bash
# Add user to video group
sudo usermod -a -G video $USER
# Log out and back in
```

### pyautogui failsafe triggered
- Move mouse to corner (0,0) to emergency stop
- Or disable: `PYAUTOGUI_FAILSAFE=false` (not recommended)

---

## 📄 License

This project is original code inspired by open-source gesture recognition research.
Released under **MIT License** - see individual files for details.

MediaPipe is licensed under Apache 2.0 (Google).
OpenCV is licensed under Apache 2.0.
PyAutoGUI is licensed under BSD.

---

## 🙏 Acknowledgments

- **MediaPipe Team** (Google) for hand tracking solution
- **Casiez et al.** for One Euro Filter algorithm
- **OpenCV** and **PyAutoGUI** communities

---

## 📝 Project Structure for Portfolio Integration

This Python project is **standalone** and independent from the web portfolio.

For the **web-based implementation** (MediaPipe Tasks Vision in browser),
see the main portfolio repository's `gesture-control/` directory.

---

*Built for UNSEPTZEROTROIS Portfolio - 2026*