"""
Configuration for Hand Gesture Control System
All parameters are centralized here for easy tuning.
"""

import os


class Config:
    """Centralized configuration for the gesture control system."""

    # ============================================================
    # CAMERA SETTINGS
    # ============================================================
    CAMERA_INDEX = int(os.getenv("CAMERA_INDEX", "0"))
    CAMERA_WIDTH = int(os.getenv("CAMERA_WIDTH", "640"))
    CAMERA_HEIGHT = int(os.getenv("CAMERA_HEIGHT", "480"))
    CAMERA_FPS = int(os.getenv("CAMERA_FPS", "30"))

    # ============================================================
    # MEDIAPIPE HAND TRACKING SETTINGS
    # ============================================================
    # Model complexity: 0 (lite), 1 (full)
    MODEL_COMPLEXITY = int(os.getenv("MODEL_COMPLEXITY", "1"))

    # Maximum number of hands to detect
    MAX_NUM_HANDS = int(os.getenv("MAX_NUM_HANDS", "1"))

    # Minimum confidence for hand detection
    MIN_DETECTION_CONFIDENCE = float(os.getenv("MIN_DETECTION_CONFIDENCE", "0.7"))

    # Minimum confidence for hand tracking
    MIN_TRACKING_CONFIDENCE = float(os.getenv("MIN_TRACKING_CONFIDENCE", "0.5"))

    # ============================================================
    # GESTURE RECOGNITION SETTINGS
    # ============================================================

    # Finger extension thresholds (normalized 0-1 relative to hand size)
    # Lower = easier to detect extended finger
    FINGER_EXTENSION_THRESHOLD = float(os.getenv("FINGER_EXTENSION_THRESHOLD", "0.5"))

    # Thumb extension uses different geometry (IP joint to tip vs MCP)
    THUMB_EXTENSION_THRESHOLD = float(os.getenv("THUMB_EXTENSION_THRESHOLD", "0.4"))

    # Pinch detection: normalized distance between thumb tip and index tip
    # Lower = pinch detected more easily
    PINCH_THRESHOLD = float(os.getenv("PINCH_THRESHOLD", "0.05"))

    # Minimum frames a gesture must be held before activation (debouncing)
    GESTURE_HOLD_FRAMES = int(os.getenv("GESTURE_HOLD_FRAMES", "3"))

    # Frames to wait before allowing gesture transition (hysteresis)
    GESTURE_TRANSITION_DELAY = int(os.getenv("GESTURE_TRANSITION_DELAY", "5"))

    # ============================================================
    # MOUSE CONTROL SETTINGS
    # ============================================================

    # Screen mapping: webcam coordinates -> screen coordinates
    # Enable horizontal flip (mirror mode) for natural interaction
    MIRROR_HORIZONTAL = os.getenv("MIRROR_HORIZONTAL", "true").lower() == "true"

    # Control region: fraction of webcam frame used for cursor control
    # 1.0 = full frame, 0.8 = center 80%, etc.
    CONTROL_REGION_RATIO = float(os.getenv("CONTROL_REGION_RATIO", "0.8"))

    # Cursor smoothing: One Euro Filter parameters
    # Frequency (Hz) - how often filter updates
    OE_FREQUENCY = float(os.getenv("OE_FREQUENCY", "60.0"))

    # Minimum cutoff frequency (lower = more smoothing at slow speeds)
    OE_MINCUTOFF = float(os.getenv("OE_MINCUTOFF", "1.0"))

    # Beta (derivative cutoff) - responsiveness to speed changes
    OE_BETA = float(os.getenv("OE_BETA", "0.0"))

    # Derivative cutoff frequency
    OE_DCUTOFF = float(os.getenv("OE_DCUTOFF", "1.0"))

    # Cursor movement speed multiplier
    CURSOR_SPEED = float(os.getenv("CURSOR_SPEED", "1.5"))

    # Maximum cursor jump per frame (pixels) - prevents jumps
    MAX_CURSOR_JUMP = int(os.getenv("MAX_CURSOR_JUMP", "50"))

    # ============================================================
    # SCROLL CONTROL SETTINGS
    # ============================================================

    # Scroll speed multiplier (pyautogui scroll units per frame)
    SCROLL_SPEED = float(os.getenv("SCROLL_SPEED", "3.0"))

    # Minimum hand movement (normalized) to trigger scroll
    SCROLL_MOVEMENT_THRESHOLD = float(os.getenv("SCROLL_MOVEMENT_THRESHOLD", "0.02"))

    # Smoothing for scroll velocity
    SCROLL_SMOOTHING = float(os.getenv("SCROLL_SMOOTHING", "0.3"))

    # ============================================================
    # CLICK CONTROL SETTINGS
    # ============================================================

    # Minimum time between clicks (seconds) - prevents double-click
    CLICK_COOLDOWN = float(os.getenv("CLICK_COOLDOWN", "0.5"))

    # Pinch must be held this many frames before click registers
    PINCH_HOLD_FRAMES = int(os.getenv("PINCH_HOLD_FRAMES", "2"))

    # ============================================================
    # DISPLAY SETTINGS
    # ============================================================

    # Show debug visualization (landmarks, gesture info)
    SHOW_DEBUG = os.getenv("SHOW_DEBUG", "true").lower() == "true"

    # Show FPS counter
    SHOW_FPS = os.getenv("SHOW_FPS", "true").lower() == "true"

    # Window name
    WINDOW_NAME = "Gesture Control - Press 'q' to quit"

    # Colors (BGR format for OpenCV)
    COLOR_HAND_LANDMARKS = (0, 255, 0)      # Green
    COLOR_HAND_CONNECTIONS = (255, 0, 0)    # Blue
    COLOR_GESTURE_TEXT = (0, 255, 255)      # Yellow
    COLOR_FPS_TEXT = (255, 255, 255)        # White
    COLOR_PINCH_LINE = (0, 0, 255)          # Red
    COLOR_CURSOR_POS = (255, 0, 255)        # Magenta

    # ============================================================
    # SAFETY SETTINGS
    # ============================================================

    # Emergency stop gesture hold time (frames) - 5 fingers open
    EMERGENCY_STOP_HOLD_FRAMES = int(os.getenv("EMERGENCY_STOP_HOLD_FRAMES", "5"))

    # Auto-stop if no hand detected for this many frames
    NO_HAND_TIMEOUT_FRAMES = int(os.getenv("NO_HAND_TIMEOUT_FRAMES", "60"))

    # Fail-safe: disable pyautogui fail-safe (corner escape)
    # WARNING: Set to False only if you know what you're doing
    PYAUTOGUI_FAILSAFE = os.getenv("PYAUTOGUI_FAILSAFE", "true").lower() == "true"

    @classmethod
    def print_config(cls):
        """Print all configuration values."""
        print("=" * 60)
        print("GESTURE CONTROL CONFIGURATION")
        print("=" * 60)
        for attr in dir(cls):
            if not attr.startswith("_") and not callable(getattr(cls, attr)):
                print(f"  {attr}: {getattr(cls, attr)}")
        print("=" * 60)


if __name__ == "__main__":
    Config.print_config()