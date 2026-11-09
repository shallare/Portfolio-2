"""
Mouse Controller Module
Handles system cursor movement and clicks using pyautogui.
Maps normalized webcam coordinates to screen coordinates.
"""

import time
from typing import Tuple, Optional
from config import Config
from one_euro_filter import OneEuroFilter2D

# Optional pyautogui import for headless environments
PYAUTOGUI_AVAILABLE = False
pyautogui = None

try:
    import pyautogui as _pyautogui
    # Test if it actually works (mouseinfo needs display)
    _pyautogui.size()
    pyautogui = _pyautogui
    PYAUTOGUI_AVAILABLE = True
except Exception:
    # Any error (ImportError, DisplayConnectionError, etc.)
    PYAUTOGUI_AVAILABLE = False
    pyautogui = None


class MouseController:
    """
    Controls system mouse cursor and clicks.
    Maps normalized hand coordinates (0-1) to screen coordinates.
    """

    def __init__(self, config: Optional[Config] = None):
        self.config = config or Config()

        # Get screen dimensions (fallback for headless)
        if PYAUTOGUI_AVAILABLE:
            self.screen_width, self.screen_height = pyautogui.size()
        else:
            # Default fallback for headless testing
            self.screen_width, self.screen_height = 1920, 1080

        # Configure pyautogui
        if PYAUTOGUI_AVAILABLE:
            pyautogui.FAILSAFE = self.config.PYAUTOGUI_FAILSAFE
            pyautogui.PAUSE = 0  # We handle timing ourselves

        # Cursor smoothing filter
        self.filter = OneEuroFilter2D(self.config)

        # State
        self.last_click_time = 0
        self.is_dragging = False
        self.cursor_x = self.screen_width // 2
        self.cursor_y = self.screen_height // 2

        # Control region bounds (normalized 0-1)
        ratio = self.config.CONTROL_REGION_RATIO
        margin = (1 - ratio) / 2
        self.control_min_x = margin
        self.control_max_x = 1 - margin
        self.control_min_y = margin
        self.control_max_y = 1 - margin

        # Move to center initially
        self.move_to_center()

    def move_to_center(self):
        """Move cursor to screen center."""
        self.cursor_x = self.screen_width // 2
        self.cursor_y = self.screen_height // 2
        if PYAUTOGUI_AVAILABLE:
            pyautogui.moveTo(self.cursor_x, self.cursor_y)
        self.filter.reset(0.5, 0.5)

    def map_to_screen(self, norm_x: float, norm_y: float) -> Tuple[int, int]:
        """
        Map normalized coordinates (0-1) to screen pixels.

        Args:
            norm_x: Normalized x (0=left, 1=right)
            norm_y: Normalized y (0=top, 1=bottom)

        Returns:
            (screen_x, screen_y) in pixels
        """
        # Apply mirror if configured
        if self.config.MIRROR_HORIZONTAL:
            norm_x = 1 - norm_x

        # Clamp to control region
        norm_x = max(self.control_min_x, min(self.control_max_x, norm_x))
        norm_y = max(self.control_min_y, min(self.control_max_y, norm_y))

        # Remap from control region to full screen
        mapped_x = (norm_x - self.control_min_x) / (self.control_max_x - self.control_min_x)
        mapped_y = (norm_y - self.control_min_y) / (self.control_max_y - self.control_min_y)

        # Apply speed multiplier
        mapped_x = 0.5 + (mapped_x - 0.5) * self.config.CURSOR_SPEED
        mapped_y = 0.5 + (mapped_y - 0.5) * self.config.CURSOR_SPEED

        # Clamp to screen bounds
        mapped_x = max(0.0, min(1.0, mapped_x))
        mapped_y = max(0.0, min(1.0, mapped_y))

        # Convert to screen pixels
        screen_x = int(mapped_x * self.screen_width)
        screen_y = int(mapped_y * self.screen_height)

        return screen_x, screen_y

    def update_cursor(self, norm_x: float, norm_y: float, timestamp: float = None):
        """
        Update cursor position with smoothing.

        Args:
            norm_x: Normalized x (0-1)
            norm_y: Normalized y (0-1)
            timestamp: Optional timestamp for filter
        """
        # Apply smoothing filter
        smooth_x, smooth_y = self.filter.update(norm_x, norm_y, timestamp)

        # Map to screen
        screen_x, screen_y = self.map_to_screen(smooth_x, smooth_y)

        # Limit maximum jump per frame
        dx = screen_x - self.cursor_x
        dy = screen_y - self.cursor_y
        distance = (dx**2 + dy**2)**0.5

        if distance > self.config.MAX_CURSOR_JUMP:
            # Scale down to max jump
            scale = self.config.MAX_CURSOR_JUMP / distance
            screen_x = int(self.cursor_x + dx * scale)
            screen_y = int(self.cursor_y + dy * scale)

        # Move cursor
        if PYAUTOGUI_AVAILABLE:
            pyautogui.moveTo(screen_x, screen_y)
        self.cursor_x = screen_x
        self.cursor_y = screen_y

    def click(self, button: str = 'left'):
        """
        Perform a click.

        Args:
            button: 'left', 'right', or 'middle'
        """
        current_time = time.time()
        if current_time - self.last_click_time < self.config.CLICK_COOLDOWN:
            return False  # Click blocked by cooldown

        if PYAUTOGUI_AVAILABLE:
            pyautogui.click(button=button)
        self.last_click_time = current_time
        return True

    def double_click(self):
        """Perform a double click."""
        current_time = time.time()
        if current_time - self.last_click_time < self.config.CLICK_COOLDOWN * 2:
            return False

        if PYAUTOGUI_AVAILABLE:
            pyautogui.doubleClick()
        self.last_click_time = current_time
        return True

    def mouse_down(self, button: str = 'left'):
        """Press mouse button (for drag)."""
        if not self.is_dragging:
            if PYAUTOGUI_AVAILABLE:
                pyautogui.mouseDown(button=button)
            self.is_dragging = True

    def mouse_up(self, button: str = 'left'):
        """Release mouse button."""
        if self.is_dragging:
            if PYAUTOGUI_AVAILABLE:
                pyautogui.mouseUp(button=button)
            self.is_dragging = False

    def scroll(self, amount: int):
        """
        Scroll vertically.

        Args:
            amount: Positive = scroll up, negative = scroll down
        """
        if amount != 0 and PYAUTOGUI_AVAILABLE:
            pyautogui.scroll(int(amount))

    def get_position(self) -> Tuple[int, int]:
        """Get current cursor position."""
        if PYAUTOGUI_AVAILABLE:
            return pyautogui.position()
        return (self.cursor_x, self.cursor_y)

    def emergency_stop(self):
        """Emergency stop - move to center and release all buttons."""
        self.move_to_center()
        if self.is_dragging:
            if PYAUTOGUI_AVAILABLE:
                pyautogui.mouseUp()
            self.is_dragging = False


def create_mouse_controller(config: Config = None) -> MouseController:
    """Factory function to create MouseController."""
    return MouseController(config)


if __name__ == "__main__":
    # Quick test - just verify imports work
    controller = MouseController()
    print(f"Screen size: {controller.screen_width}x{controller.screen_height}")
    print(f"Control region: x[{controller.control_min_x:.2f}-{controller.control_max_x:.2f}], "
          f"y[{controller.control_min_y:.2f}-{controller.control_max_y:.2f}]")
    print("MouseController initialized successfully")
    print(f"PyAutoGUI available: {PYAUTOGUI_AVAILABLE}")