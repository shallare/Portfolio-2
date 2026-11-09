#!/usr/bin/env python3
"""
Main Entry Point - Hand Gesture Control System
Standalone Python application for controlling mouse and scroll via webcam gestures.

Gestures:
1. STOP (5 fingers open) - Emergency stop, highest priority
2. CLICK (pinch thumb-index) - Left click
3. SCROLL (index + middle) - Scroll up/down by moving hand up/down
4. CURSOR (index only) - Move mouse cursor
5. NEUTRAL - No action

Controls:
- 'q' or ESC: Quit
- 'd': Toggle debug display
- 'r': Reset cursor to center
- 's': Toggle scroll mode
- 'c': Toggle click mode
"""

import cv2
import time
import signal
import sys
from typing import Optional

from config import Config
from hand_tracking import HandTracker
from gesture_recognition import GestureRecognizer, GestureType
from mouse_controller import MouseController
from scroll_controller import ScrollController


class GestureControlApp:
    """Main application class orchestrating all components."""

    def __init__(self, config: Optional[Config] = None):
        self.config = config or Config()
        self.running = False

        # Initialize components
        self.hand_tracker = HandTracker(self.config)
        self.gesture_recognizer = GestureRecognizer(self.config)
        self.mouse_controller = MouseController(self.config)
        self.scroll_controller = ScrollController(self.config)

        # Camera
        self.cap = None

        # Performance tracking
        self.frame_count = 0
        self.fps_start_time = time.time()
        self.current_fps = 0

        # Debug
        self.show_debug = self.config.SHOW_DEBUG
        self.no_hand_frames = 0

        # Setup signal handlers
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)

    def _signal_handler(self, signum, frame):
        """Handle interrupt signals gracefully."""
        print("\nShutdown signal received...")
        self.stop()

    def initialize_camera(self) -> bool:
        """Initialize webcam capture."""
        self.cap = cv2.VideoCapture(self.config.CAMERA_INDEX)

        if not self.cap.isOpened():
            print(f"Error: Could not open camera index {self.config.CAMERA_INDEX}")
            return False

        # Set camera properties
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.config.CAMERA_WIDTH)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.config.CAMERA_HEIGHT)
        self.cap.set(cv2.CAP_PROP_FPS, self.config.CAMERA_FPS)

        # Verify settings
        actual_width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        actual_height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        actual_fps = self.cap.get(cv2.CAP_PROP_FPS)

        print(f"Camera initialized: {actual_width}x{actual_height} @ {actual_fps:.1f} FPS")
        return True

    def start(self):
        """Start the main loop."""
        if not self.initialize_camera():
            return

        self.running = True
        print("\n" + "=" * 60)
        print("GESTURE CONTROL STARTED")
        print("=" * 60)
        print("Gestures:")
        print("  ✋ 5 fingers open  -> STOP (emergency)")
        print("  👌 Pinch thumb+index -> CLICK")
        print("  ☝️ Index+Middle     -> SCROLL (move hand up/down)")
        print("  👆 Index only      -> CURSOR")
        print("\nControls:")
        print("  'q' / ESC  -> Quit")
        print("  'd'        -> Toggle debug")
        print("  'r'        -> Reset cursor")
        print("  'h'        -> Show help")
        print("=" * 60 + "\n")

        self._main_loop()

    def _main_loop(self):
        """Main processing loop."""
        while self.running:
            # Read frame
            ret, frame = self.cap.read()
            if not ret:
                print("Error: Failed to read frame")
                break

            # Mirror horizontally for natural interaction
            if self.config.MIRROR_HORIZONTAL:
                frame = cv2.flip(frame, 1)

            # Process hand tracking
            results = self.hand_tracker.process(frame)

            # Get landmarks
            landmarks_list = self.hand_tracker.get_landmarks(results)

            # Process first detected hand
            if landmarks_list:
                self.no_hand_frames = 0
                landmarks = landmarks_list[0]

                # Recognize gesture
                gesture = self.gesture_recognizer.recognize(landmarks)

                # Execute gesture action
                self._execute_gesture(gesture, landmarks)

                # Draw debug info
                if self.show_debug:
                    frame = self._draw_debug(frame, results, landmarks)
            else:
                self.no_hand_frames += 1
                # Check timeout
                if self.no_hand_frames >= self.config.NO_HAND_TIMEOUT_FRAMES:
                    self._handle_no_hand_timeout()

                if self.show_debug:
                    frame = self._draw_debug(frame, results, None)

            # Update FPS
            self._update_fps()

            # Display
            cv2.imshow(self.config.WINDOW_NAME, frame)

            # Handle keys
            key = cv2.waitKey(1) & 0xFF
            self._handle_key(key)

        self.stop()

    def _execute_gesture(self, gesture: GestureType, landmarks):
        """Execute action based on recognized gesture."""
        debug_info = self.gesture_recognizer.get_debug_info()

        if gesture == GestureType.STOP:
            # Emergency stop - highest priority
            self.mouse_controller.emergency_stop()
            self.scroll_controller.emergency_stop()
            self.gesture_recognizer.reset()

        elif gesture == GestureType.CLICK:
            # Click on transition TO click gesture
            if self.gesture_recognizer.is_click_triggered():
                self.mouse_controller.click('left')

        elif gesture == GestureType.SCROLL:
            # Scroll based on hand vertical movement
            scroll_delta = self.gesture_recognizer.get_scroll_delta()
            if abs(scroll_delta) > self.config.SCROLL_MOVEMENT_THRESHOLD:
                scroll_amount = self.scroll_controller.update(
                    landmarks[0][1],  # hand center y
                    scroll_delta
                )
                self.scroll_controller.apply_scroll(scroll_amount)

        elif gesture == GestureType.CURSOR:
            # Move cursor to index finger tip
            index_tip = self.gesture_recognizer.get_cursor_position()
            self.mouse_controller.update_cursor(index_tip[0], index_tip[1])

        # NEUTRAL: no action

    def _handle_no_hand_timeout(self):
        """Handle case when no hand detected for too long."""
        # Could implement auto-pause here
        pass

    def _draw_debug(self, frame, results, landmarks):
        """Draw debug visualization on frame."""
        h, w = frame.shape[:2]

        # Draw hand landmarks (new API uses hand_landmarks)
        if results and results.hand_landmarks:
            frame = self.hand_tracker.draw_landmarks(frame, results)

        # Get debug info
        debug_info = self.gesture_recognizer.get_debug_info()

        # Draw gesture info panel
        panel_x, panel_y = 10, 30
        line_height = 25

        # Background panel
        panel_width = 300
        panel_height = 200
        overlay = frame.copy()
        cv2.rectangle(overlay, (panel_x - 5, panel_y - 25),
                     (panel_x + panel_width, panel_y + panel_height),
                     (0, 0, 0), -1)
        cv2.addWeighted(overlay, 0.7, frame, 0.3, 0, frame)

        # Gesture name (large)
        gesture_name = debug_info['gesture']
        color = self._get_gesture_color(gesture_name)
        cv2.putText(frame, f"GESTURE: {gesture_name}",
                   (panel_x, panel_y), cv2.FONT_HERSHEY_SIMPLEX,
                   0.8, color, 2)

        # Finger states
        y = panel_y + line_height
        fingers = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']
        for i, (name, state) in enumerate(zip(fingers, debug_info['fingers'])):
            color = (0, 255, 0) if state else (0, 0, 255)
            cv2.putText(frame, f"  {name}: {'UP' if state else 'DOWN'}",
                       (panel_x, y), cv2.FONT_HERSHEY_SIMPLEX,
                       0.5, color, 1)
            y += line_height

        # Pinch distance
        pinch_color = (0, 255, 0) if debug_info['pinch_distance'] < self.config.PINCH_THRESHOLD else (255, 255, 255)
        cv2.putText(frame, f"Pinch: {debug_info['pinch_distance']:.4f} (thresh: {debug_info['pinch_threshold']})",
                   (panel_x, y), cv2.FONT_HERSHEY_SIMPLEX,
                   0.5, pinch_color, 1)
        y += line_height

        # Extended count
        cv2.putText(frame, f"Extended: {debug_info['extended_count']}/5",
                   (panel_x, y), cv2.FONT_HERSHEY_SIMPLEX,
                   0.5, (255, 255, 255), 1)
        y += line_height

        # Scroll velocity
        if debug_info['gesture'] == 'SCROLL':
            cv2.putText(frame, f"Scroll Vel: {debug_info['scroll_velocity']:.2f}",
                       (panel_x, y), cv2.FONT_HERSHEY_SIMPLEX,
                       0.5, (0, 255, 255), 1)
            y += line_height

        # FPS
        if self.config.SHOW_FPS:
            cv2.putText(frame, f"FPS: {self.current_fps:.1f}",
                       (w - 120, 30), cv2.FONT_HERSHEY_SIMPLEX,
                       0.7, self.config.COLOR_FPS_TEXT, 2)

        # Controls hint
        cv2.putText(frame, "Q/ESC: Quit | D: Debug | R: Reset | H: Help",
                   (10, h - 15), cv2.FONT_HERSHEY_SIMPLEX,
                   0.45, (150, 150, 150), 1)

        # Draw pinch line if pinching
        if landmarks and len(landmarks) == 21:
            pinch_dist = self.hand_tracker.get_pinch_distance(landmarks)
            if pinch_dist < self.config.PINCH_THRESHOLD * 2:  # Show when close
                thumb_tip = landmarks[4]
                index_tip = landmarks[8]
                pt1 = (int(thumb_tip[0] * w), int(thumb_tip[1] * h))
                pt2 = (int(index_tip[0] * w), int(index_tip[1] * h))
                cv2.line(frame, pt1, pt2, self.config.COLOR_PINCH_LINE, 2)
                cv2.circle(frame, pt1, 8, self.config.COLOR_PINCH_LINE, -1)
                cv2.circle(frame, pt2, 8, self.config.COLOR_PINCH_LINE, -1)

        return frame

    def _get_gesture_color(self, gesture_name: str) -> tuple:
        """Get color for gesture display."""
        colors = {
            'STOP': (0, 0, 255),      # Red
            'CLICK': (0, 255, 0),     # Green
            'SCROLL': (255, 255, 0),  # Cyan
            'CURSOR': (255, 0, 255),  # Magenta
            'NEUTRAL': (128, 128, 128), # Gray
        }
        return colors.get(gesture_name, (255, 255, 255))

    def _update_fps(self):
        """Update FPS counter."""
        self.frame_count += 1
        elapsed = time.time() - self.fps_start_time
        if elapsed >= 1.0:
            self.current_fps = self.frame_count / elapsed
            self.frame_count = 0
            self.fps_start_time = time.time()

    def _handle_key(self, key: int):
        """Handle keyboard input."""
        if key == ord('q') or key == 27:  # q or ESC
            self.stop()
        elif key == ord('d'):
            self.show_debug = not self.show_debug
            print(f"Debug display: {'ON' if self.show_debug else 'OFF'}")
        elif key == ord('r'):
            self.mouse_controller.move_to_center()
            self.gesture_recognizer.reset()
            print("Cursor reset to center")
        elif key == ord('h'):
            self._print_help()
        elif key == ord('s'):
            # Toggle scroll - could implement mode switching
            pass
        elif key == ord('c'):
            # Toggle click
            pass

    def _print_help(self):
        """Print help message."""
        print("\n" + "=" * 50)
        print("HELP - Gesture Control")
        print("=" * 50)
        print("Gestures:")
        print("  STOP:     Open all 5 fingers (emergency stop)")
        print("  CLICK:    Pinch thumb + index finger")
        print("  SCROLL:   Extend index + middle, move hand up/down")
        print("  CURSOR:   Extend only index finger")
        print("\nKeys:")
        print("  Q/ESC:    Quit application")
        print("  D:        Toggle debug overlay")
        print("  R:        Reset cursor to center")
        print("  H:        Show this help")
        print("=" * 50 + "\n")

    def stop(self):
        """Stop the application and clean up."""
        self.running = False

        if self.cap:
            self.cap.release()

        cv2.destroyAllWindows()

        # Emergency cleanup
        self.mouse_controller.emergency_stop()

        print("\nGesture control stopped. Goodbye!")


def main():
    """Main entry point."""
    # Print configuration
    Config.print_config()

    # Create and run app
    app = GestureControlApp()
    app.start()


if __name__ == "__main__":
    main()