"""
Scroll Controller Module
Handles smooth scrolling based on hand gestures.
"""

from typing import Tuple, Optional
from config import Config

# Optional pyautogui import for headless environments
PYAUTOGUI_AVAILABLE = False
pyautogui = None

try:
    import pyautogui as _pyautogui
    _pyautogui.size()
    pyautogui = _pyautogui
    PYAUTOGUI_AVAILABLE = True
except Exception:
    PYAUTOGUI_AVAILABLE = False
    pyautogui = None


class ScrollController:
    """
    Controls page scrolling based on hand movement.
    Used when SCROLL gesture (index + middle fingers) is active.
    """

    def __init__(self, config: Optional[Config] = None):
        self.config = config or Config()

        # Scroll state
        self.accumulated_scroll = 0.0
        self.last_hand_y = None
        self.is_active = False

    def update(self, hand_center_y: float, scroll_velocity: float) -> int:
        """
        Update scroll based on hand movement.

        Args:
            hand_center_y: Normalized hand center Y (0=top, 1=bottom)
            scroll_velocity: Calculated scroll velocity from gesture recognizer

        Returns:
            Scroll amount to apply (pyautogui units)
        """
        if not self.is_active:
            self.last_hand_y = hand_center_y
            self.is_active = True
            return 0

        # Use velocity from gesture recognizer (already smoothed)
        scroll_amount = scroll_velocity

        # Accumulate fractional scroll
        self.accumulated_scroll += scroll_amount

        # Extract integer part for pyautogui
        scroll_int = int(self.accumulated_scroll)
        self.accumulated_scroll -= scroll_int

        return scroll_int

    def apply_scroll(self, amount: int):
        """Apply scroll to system."""
        if amount != 0 and PYAUTOGUI_AVAILABLE:
            # pyautogui.scroll: positive = up, negative = down
            pyautogui.scroll(amount)
        elif amount != 0:
            # Headless mode: just log
            print(f"[Headless] Would scroll: {amount}")

    def reset(self):
        """Reset scroll state."""
        self.accumulated_scroll = 0.0
        self.last_hand_y = None
        self.is_active = False

    def emergency_stop(self):
        """Emergency stop - reset all scroll state."""
        self.reset()


def create_scroll_controller(config: Config = None) -> ScrollController:
    """Factory function to create ScrollController."""
    return ScrollController(config)


if __name__ == "__main__":
    # Quick test
    controller = ScrollController()
    print("ScrollController initialized successfully")
    print(f"PyAutoGUI available: {PYAUTOGUI_AVAILABLE}")