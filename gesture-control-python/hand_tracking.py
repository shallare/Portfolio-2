"""
Hand Tracking Module using MediaPipe Tasks Vision (v1.x+)
Provides hand landmark detection with 21 keypoints per hand.
"""

import cv2
import mediapipe as mp
import numpy as np
from typing import Optional, List, Tuple
from config import Config


class HandTracker:
    """Wrapper around MediaPipe HandLandmarker for landmark detection."""

    # MediaPipe hand landmark indices (same for both old and new API)
    # Reference: https://developers.google.com/mediapipe/solutions/vision/hand_landmarker
    LANDMARK_NAMES = [
        "WRIST",                    # 0
        "THUMB_CMC", "THUMB_MCP", "THUMB_IP", "THUMB_TIP",        # 1-4
        "INDEX_MCP", "INDEX_PIP", "INDEX_DIP", "INDEX_TIP",       # 5-8
        "MIDDLE_MCP", "MIDDLE_PIP", "MIDDLE_DIP", "MIDDLE_TIP",   # 9-12
        "RING_MCP", "RING_PIP", "RING_DIP", "RING_TIP",           # 13-16
        "PINKY_MCP", "PINKY_PIP", "PINKY_DIP", "PINKY_TIP",       # 17-20
    ]

    # Finger tip indices for easy access
    FINGER_TIPS = [4, 8, 12, 16, 20]      # Thumb, Index, Middle, Ring, Pinky tips
    FINGER_PIPS = [3, 6, 10, 14, 18]      # PIP joints (or IP for thumb)
    FINGER_MCPS = [2, 5, 9, 13, 17]       # MCP joints (or CMC for thumb)

    def __init__(self, config: Optional[Config] = None):
        """Initialize MediaPipe HandLandmarker."""
        self.config = config or Config()

        # MediaPipe Tasks Vision API
        self.mp_vision = mp.tasks.vision
        self.mp_image = mp.Image
        self.mp_image_format = mp.ImageFormat
        self.mp_drawing = mp.tasks.vision.drawing_utils
        self.mp_drawing_styles = mp.tasks.vision.drawing_styles

        # Configure HandLandmarker
        base_options = mp.tasks.BaseOptions(
            model_asset_path=self._get_model_path()
        )

        options = self.mp_vision.HandLandmarkerOptions(
            base_options=base_options,
            running_mode=self.mp_vision.RunningMode.VIDEO,
            num_hands=self.config.MAX_NUM_HANDS,
            min_hand_detection_confidence=self.config.MIN_DETECTION_CONFIDENCE,
            min_hand_presence_confidence=self.config.MIN_TRACKING_CONFIDENCE,
            min_tracking_confidence=self.config.MIN_TRACKING_CONFIDENCE,
        )

        self.landmarker = self.mp_vision.HandLandmarker.create_from_options(options)

        # Store latest results
        self.latest_results = None
        self.latest_frame = None
        self.timestamp_ms = 0

    def _get_model_path(self) -> str:
        """Get path to MediaPipe hand landmarker model."""
        # The model is bundled with mediapipe package
        import os
        import mediapipe as mp
        mp_root = os.path.dirname(mp.__file__)
        model_path = os.path.join(mp_root, 'tasks', 'vision', 'hand_landmarker.task')
        if os.path.exists(model_path):
            return model_path
        # Fallback: let mediapipe download it
        return 'hand_landmarker.task'

    def process(self, frame: np.ndarray) -> Optional[mp.tasks.vision.HandLandmarkerResult]:
        """
        Process a frame and detect hand landmarks.

        Args:
            frame: BGR image from OpenCV

        Returns:
            MediaPipe HandLandmarkerResult or None
        """
        # Convert BGR to RGB
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # Create MediaPipe Image
        mp_image = self.mp_image(image_format=self.mp_image_format.SRGB, data=rgb_frame)

        # Process with timestamp (required for VIDEO mode)
        self.timestamp_ms += int(1000 / self.config.CAMERA_FPS)
        results = self.landmarker.detect_for_video(mp_image, self.timestamp_ms)

        # Store for drawing
        self.latest_results = results
        self.latest_frame = frame

        return results

    def get_landmarks(self, results=None) -> List[List[Tuple[float, float, float]]]:
        """
        Extract normalized landmarks from results.

        Args:
            results: MediaPipe results (uses latest if None)

        Returns:
            List of hands, each hand is list of (x, y, z) normalized coordinates
        """
        if results is None:
            results = self.latest_results

        if not results or not results.hand_landmarks:
            return []

        landmarks_list = []
        for hand_landmarks in results.hand_landmarks:
            hand_points = []
            for landmark in hand_landmarks:
                hand_points.append((landmark.x, landmark.y, landmark.z))
            landmarks_list.append(hand_points)

        return landmarks_list

    def get_handedness(self, results=None) -> List[str]:
        """
        Get handedness (Left/Right) for each detected hand.

        Args:
            results: MediaPipe results (uses latest if None)

        Returns:
            List of "Left" or "Right" strings
        """
        if results is None:
            results = self.latest_results

        if not results or not results.handedness:
            return []

        handedness = []
        for classification_list in results.handedness:
            # classification_list is a list of Classification objects
            for classification in classification_list:
                handedness.append(classification.category_name)
                break  # Take first (highest confidence)

        return handedness

    def draw_landmarks(
        self,
        frame: np.ndarray,
        results=None,
        draw_connections: bool = True,
        draw_landmarks: bool = True
    ) -> np.ndarray:
        """
        Draw hand landmarks and connections on frame.

        Args:
            frame: BGR image to draw on
            results: MediaPipe results (uses latest if None)
            draw_connections: Whether to draw connections
            draw_landmarks: Whether to draw landmark points

        Returns:
            Frame with drawings
        """
        if results is None:
            results = self.latest_results

        if not results or not results.hand_landmarks:
            return frame

        annotated_frame = frame.copy()

        for hand_landmarks in results.hand_landmarks:
            # Convert to NormalizedLandmarkList for drawing utils
            landmark_list = mp.tasks.vision.HandLandmarkerResult(
                hand_landmarks=[hand_landmarks],
                handedness=[],
                hand_world_landmarks=[]
            )

            if draw_connections:
                self.mp_drawing.draw_landmarks(
                    annotated_frame,
                    hand_landmarks,
                    self.mp_vision.HandLandmarksConnections.HAND_CONNECTIONS,
                    self.mp_drawing_styles.get_default_hand_landmarks_style(),
                    self.mp_drawing_styles.get_default_hand_connections_style()
                )
            elif draw_landmarks:
                # Draw only landmarks without connections
                h, w = frame.shape[:2]
                for landmark in hand_landmarks:
                    cx, cy = int(landmark.x * w), int(landmark.y * h)
                    cv2.circle(annotated_frame, (cx, cy), 3, self.config.COLOR_HAND_LANDMARKS, -1)

        return annotated_frame

    def get_finger_states(self, landmarks: List[Tuple[float, float, float]]) -> List[bool]:
        """
        Determine which fingers are extended.

        Args:
            landmarks: List of 21 (x, y, z) tuples for one hand

        Returns:
            List of 5 booleans: [thumb, index, middle, ring, pinky] extended states
        """
        if len(landmarks) != 21:
            return [False] * 5

        finger_states = []

        # Thumb: compare tip (4) to IP joint (3) - different axis for thumb
        # Use distance from wrist for robustness
        thumb_tip = landmarks[4]
        thumb_ip = landmarks[3]
        thumb_mcp = landmarks[2]
        wrist = landmarks[0]

        # Thumb extension: tip further from wrist than IP joint
        thumb_dist_tip = np.linalg.norm(np.array(thumb_tip[:2]) - np.array(wrist[:2]))
        thumb_dist_ip = np.linalg.norm(np.array(thumb_ip[:2]) - np.array(wrist[:2]))
        finger_states.append(thumb_dist_tip > thumb_dist_ip * self.config.THUMB_EXTENSION_THRESHOLD + 0.02)

        # Other fingers: tip higher (smaller y) than PIP joint
        for i in range(1, 5):  # Index, Middle, Ring, Pinky
            tip_idx = self.FINGER_TIPS[i]
            pip_idx = self.FINGER_PIPS[i]

            tip = landmarks[tip_idx]
            pip = landmarks[pip_idx]

            # In image coordinates, y increases downward, so tip.y < pip.y means extended
            finger_states.append(tip[1] < pip[1] - self.config.FINGER_EXTENSION_THRESHOLD * 0.02)

        return finger_states

    def get_pinch_distance(self, landmarks: List[Tuple[float, float, float]]) -> float:
        """
        Calculate normalized distance between thumb tip and index tip.

        Args:
            landmarks: List of 21 (x, y, z) tuples for one hand

        Returns:
            Normalized distance (0-1 scale relative to hand size)
        """
        if len(landmarks) != 21:
            return 1.0

        thumb_tip = np.array(landmarks[4][:2])
        index_tip = np.array(landmarks[8][:2])

        # Hand size reference: distance from wrist to middle finger MCP
        wrist = np.array(landmarks[0][:2])
        middle_mcp = np.array(landmarks[9][:2])
        hand_size = np.linalg.norm(middle_mcp - wrist) + 1e-6

        pinch_dist = np.linalg.norm(thumb_tip - index_tip)
        return pinch_dist / hand_size

    def get_hand_center(self, landmarks: List[Tuple[float, float, float]]) -> Tuple[float, float]:
        """
        Get center of hand (palm) for cursor mapping.

        Args:
            landmarks: List of 21 (x, y, z) tuples for one hand

        Returns:
            (x, y) normalized coordinates of hand center
        """
        if len(landmarks) != 21:
            return (0.5, 0.5)

        # Use wrist and middle MCP as reference
        wrist = landmarks[0]
        middle_mcp = landmarks[9]

        center_x = (wrist[0] + middle_mcp[0]) / 2
        center_y = (wrist[1] + middle_mcp[1]) / 2

        return (center_x, center_y)

    def get_index_tip(self, landmarks: List[Tuple[float, float, float]]) -> Tuple[float, float]:
        """
        Get index finger tip position.

        Args:
            landmarks: List of 21 (x, y, z) tuples for one hand

        Returns:
            (x, y) normalized coordinates of index tip
        """
        if len(landmarks) != 21:
            return (0.5, 0.5)

        return landmarks[8][:2]

    def close(self):
        """Release MediaPipe resources."""
        if self.landmarker:
            self.landmarker.close()
            self.landmarker = None


def create_hand_tracker(config: Optional[Config] = None) -> HandTracker:
    """Factory function to create HandTracker."""
    return HandTracker(config)


if __name__ == "__main__":
    # Quick test
    import sys
    tracker = HandTracker()
    print("HandTracker initialized successfully")
    print(f"Landmark names: {tracker.LANDMARK_NAMES}")
    tracker.close()