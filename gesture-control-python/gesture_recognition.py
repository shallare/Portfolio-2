"""
Gesture Recognition Module
Implements 5-gesture recognition with priority system:
1. STOP (5 fingers open) - Highest priority
2. CLICK (pinch thumb-index)
3. SCROLL (2 fingers: index + middle)
4. CURSOR (1 finger: index only)
5. NEUTRAL (no recognized gesture) - Lowest priority
"""

from enum import Enum
from dataclasses import dataclass, field
from typing import Optional, List, Tuple
import numpy as np
from config import Config
from hand_tracking import HandTracker


class GestureType(Enum):
    """Enumeration of recognized gestures with priority order."""
    NEUTRAL = 0
    CURSOR = 1          # Index finger only
    SCROLL = 2          # Index + Middle fingers
    CLICK = 3           # Pinch thumb-index
    STOP = 4            # All 5 fingers open (highest priority)


@dataclass
class GestureState:
    """Current state of gesture recognition."""
    current_gesture: GestureType = GestureType.NEUTRAL
    previous_gesture: GestureType = GestureType.NEUTRAL
    hold_frames: int = 0
    transition_delay: int = 0
    is_active: bool = False

    # Gesture-specific data
    finger_states: List[bool] = field(default_factory=lambda: [False] * 5)
    pinch_distance: float = 1.0
    hand_center: Tuple[float, float] = (0.5, 0.5)
    index_tip: Tuple[float, float] = (0.5, 0.5)
    scroll_velocity: float = 0.0
    prev_hand_center: Tuple[float, float] = (0.5, 0.5)


class GestureRecognizer:
    """
    Recognizes 5 gestures from hand landmarks with priority system
    and hysteresis to prevent flickering.
    """

    def __init__(self, config: Optional[Config] = None):
        self.config = config or Config()
        self.state = GestureState()

    def recognize(self, landmarks: List[Tuple[float, float, float]]) -> GestureType:
        """
        Recognize gesture from hand landmarks.

        Args:
            landmarks: List of 21 (x, y, z) tuples for one hand

        Returns:
            Recognized GestureType
        """
        if len(landmarks) != 21:
            return self._update_state(GestureType.NEUTRAL, landmarks)

        # Extract finger states and measurements
        hand_tracker = HandTracker(self.config)
        finger_states = hand_tracker.get_finger_states(landmarks)
        pinch_distance = hand_tracker.get_pinch_distance(landmarks)
        hand_center = hand_tracker.get_hand_center(landmarks)
        index_tip = hand_tracker.get_index_tip(landmarks)

        # Count extended fingers
        extended_count = sum(finger_states)

        # Determine raw gesture (before priority/hysteresis)
        raw_gesture = self._classify_raw_gesture(
            finger_states, extended_count, pinch_distance
        )

        # Apply priority and hysteresis
        final_gesture = self._apply_priority_and_hysteresis(raw_gesture, pinch_distance)

        # Update state
        self._update_state(final_gesture, landmarks, finger_states, pinch_distance,
                          hand_center, index_tip)

        return final_gesture

    def _classify_raw_gesture(
        self,
        finger_states: List[bool],
        extended_count: int,
        pinch_distance: float
    ) -> GestureType:
        """Classify gesture based on finger states and pinch (no priority)."""
        is_pinch = pinch_distance < self.config.PINCH_THRESHOLD

        # Priority 1: STOP - All 5 fingers open
        if extended_count >= 5:
            return GestureType.STOP

        # Priority 2: CLICK - Pinch detected (thumb + index touching)
        # Must NOT be just index extended (distinguish from CURSOR)
        if is_pinch and finger_states[1]:  # Index extended + pinch
            return GestureType.CLICK

        # Priority 3: SCROLL - Index + Middle extended, others folded
        if extended_count == 2 and finger_states[1] and finger_states[2]:
            return GestureType.SCROLL

        # Priority 4: CURSOR - Only index extended
        if extended_count == 1 and finger_states[1]:
            return GestureType.CURSOR

        # Default: NEUTRAL
        return GestureType.NEUTRAL

    def _apply_priority_and_hysteresis(
        self,
        raw_gesture: GestureType,
        pinch_distance: float
    ) -> GestureType:
        """
        Apply gesture priority and hysteresis to prevent flickering.

        Priority order (highest first):
        1. STOP (5 fingers)
        2. CLICK (pinch)
        3. SCROLL (2 fingers)
        4. CURSOR (1 finger)
        5. NEUTRAL
        """
        # If raw gesture is STOP, always accept (highest priority)
        if raw_gesture == GestureType.STOP:
            return GestureType.STOP

        # If currently in STOP, only exit if explicitly not STOP anymore
        if self.state.current_gesture == GestureType.STOP:
            if raw_gesture != GestureType.STOP:
                # Start transition delay
                self.state.transition_delay += 1
                if self.state.transition_delay >= self.config.GESTURE_TRANSITION_DELAY:
                    self.state.transition_delay = 0
                    return raw_gesture
            else:
                self.state.transition_delay = 0
            return GestureType.STOP

        # If raw gesture is CLICK, check priority over current
        if raw_gesture == GestureType.CLICK:
            # CLICK beats SCROLL and CURSOR
            if self.state.current_gesture in [GestureType.SCROLL, GestureType.CURSOR]:
                return GestureType.CLICK
            # If currently NEUTRAL, accept after hold frames
            return self._check_hold(GestureType.CLICK)

        # If raw gesture is SCROLL
        if raw_gesture == GestureType.SCROLL:
            # SCROLL beats CURSOR and NEUTRAL
            if self.state.current_gesture in [GestureType.CURSOR, GestureType.NEUTRAL]:
                return GestureType.SCROLL
            # If currently CLICK, don't interrupt (CLICK has higher priority)
            return self.state.current_gesture

        # If raw gesture is CURSOR
        if raw_gesture == GestureType.CURSOR:
            # CURSOR only beats NEUTRAL
            if self.state.current_gesture == GestureType.NEUTRAL:
                return self._check_hold(GestureType.CURSOR)
            return self.state.current_gesture

        # Raw gesture is NEUTRAL
        # Only transition to NEUTRAL after hold frames
        return self._check_hold(GestureType.NEUTRAL)

    def _check_hold(self, target_gesture: GestureType) -> GestureType:
        """Check if gesture should transition based on hold frames."""
        if target_gesture == self.state.current_gesture:
            self.state.hold_frames += 1
            self.state.transition_delay = 0
            return target_gesture

        # Different gesture - start counting hold frames
        self.state.hold_frames += 1
        if self.state.hold_frames >= self.config.GESTURE_HOLD_FRAMES:
            self.state.hold_frames = 0
            self.state.transition_delay = 0
            return target_gesture

        # Not held long enough - keep current
        return self.state.current_gesture

    def _update_state(
        self,
        gesture: GestureType,
        landmarks: List[Tuple[float, float, float]],
        finger_states: Optional[List[bool]] = None,
        pinch_distance: float = 1.0,
        hand_center: Tuple[float, float] = (0.5, 0.5),
        index_tip: Tuple[float, float] = (0.5, 0.5)
    ) -> GestureType:
        """Update internal state with new gesture."""
        # Track previous gesture for transition detection
        if gesture != self.state.current_gesture:
            self.state.previous_gesture = self.state.current_gesture
            self.state.hold_frames = 0
            self.state.transition_delay = 0

        self.state.current_gesture = gesture

        # Update gesture-specific data
        if finger_states is not None:
            self.state.finger_states = finger_states
        else:
            hand_tracker = HandTracker(self.config)
            self.state.finger_states = hand_tracker.get_finger_states(landmarks)

        self.state.pinch_distance = pinch_distance
        self.state.hand_center = hand_center
        self.state.index_tip = index_tip

        # Calculate scroll velocity from hand movement
        if self.state.current_gesture == GestureType.SCROLL:
            dx = hand_center[0] - self.state.prev_hand_center[0]
            dy = hand_center[1] - self.state.prev_hand_center[1]
            # Y movement: up (negative dy) = scroll down, down (positive dy) = scroll up
            self.state.scroll_velocity = -dy * self.config.SCROLL_SPEED
            # Apply smoothing
            self.state.scroll_velocity = (
                self.state.scroll_velocity * (1 - self.config.SCROLL_SMOOTHING) +
                self.state.scroll_velocity * self.config.SCROLL_SMOOTHING
            )

        self.state.prev_hand_center = hand_center
        self.state.is_active = gesture != GestureType.NEUTRAL

        return gesture

    def get_scroll_delta(self) -> float:
        """Get current scroll velocity."""
        if self.state.current_gesture == GestureType.SCROLL:
            return self.state.scroll_velocity
        return 0.0

    def is_click_triggered(self) -> bool:
        """Check if click should be triggered (transition TO click gesture)."""
        return (self.state.current_gesture == GestureType.CLICK and
                self.state.previous_gesture != GestureType.CLICK)

    def is_click_released(self) -> bool:
        """Check if click was released (transition FROM click gesture)."""
        return (self.state.current_gesture != GestureType.CLICK and
                self.state.previous_gesture == GestureType.CLICK)

    def get_cursor_position(self) -> Tuple[float, float]:
        """Get normalized cursor position (0-1)."""
        return self.state.index_tip

    def reset(self):
        """Reset gesture state."""
        self.state = GestureState()

    def get_debug_info(self) -> dict:
        """Get debug information for display."""
        return {
            "gesture": self.state.current_gesture.name,
            "previous": self.state.previous_gesture.name,
            "fingers": self.state.finger_states,
            "extended_count": sum(self.state.finger_states),
            "pinch_distance": round(self.state.pinch_distance, 4),
            "pinch_threshold": self.config.PINCH_THRESHOLD,
            "hold_frames": self.state.hold_frames,
            "is_active": self.state.is_active,
            "scroll_velocity": round(self.state.scroll_velocity, 2),
        }


def create_gesture_recognizer(config: Optional[Config] = None) -> GestureRecognizer:
    """Factory function to create GestureRecognizer."""
    return GestureRecognizer(config)


if __name__ == "__main__":
    # Quick test
    recognizer = GestureRecognizer()
    print("GestureRecognizer initialized successfully")
    print(f"Gestures: {[g.name for g in GestureType]}")