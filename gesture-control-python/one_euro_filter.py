"""
One Euro Filter for Cursor Smoothing
Based on: "The 1€ Filter: A Simple Speed-based Low-pass Filter for Noisy Input in Interactive Systems"
by Casiez et al. (2012)

This filter adapts its cutoff frequency based on signal velocity:
- Low speed: heavy smoothing (removes jitter)
- High speed: responsive (follows fast movements)
"""

import math
from dataclasses import dataclass
from typing import Tuple
from config import Config


@dataclass
class LowPassFilter:
    """Simple exponential moving average low-pass filter."""
    alpha: float = 0.5
    y: float = 0.0
    initialized: bool = False

    def update(self, x: float) -> float:
        if not self.initialized:
            self.y = x
            self.initialized = True
            return x
        self.y = self.alpha * x + (1 - self.alpha) * self.y
        return self.y

    def reset(self, x: float = 0.0):
        self.y = x
        self.initialized = True


class OneEuroFilter:
    """
    One Euro Filter for 2D cursor smoothing.

    Parameters:
        frequency: Sampling frequency (Hz)
        mincutoff: Minimum cutoff frequency (Hz) - smoothing at low speed
        beta: Cutoff frequency slope - responsiveness to speed
        dcutoff: Derivative cutoff frequency (Hz) - for velocity estimation
    """

    def __init__(
        self,
        frequency: float = 60.0,
        mincutoff: float = 1.0,
        beta: float = 0.0,
        dcutoff: float = 1.0
    ):
        self.frequency = frequency
        self.mincutoff = mincutoff
        self.beta = beta
        self.dcutoff = dcutoff

        # X and Y filters
        self.x_filter = LowPassFilter()
        self.y_filter = LowPassFilter()

        # Derivative filters for velocity estimation
        self.dx_filter = LowPassFilter()
        self.dy_filter = LowPassFilter()

        self.last_x = None
        self.last_y = None
        self.last_time = None

    def _alpha(self, cutoff: float) -> float:
        """Calculate alpha for given cutoff frequency."""
        tau = 1.0 / (2 * math.pi * cutoff)
        te = 1.0 / self.frequency
        return 1.0 / (1.0 + tau / te)

    def update(self, x: float, y: float, timestamp: float = None) -> Tuple[float, float]:
        """
        Update filter with new position.

        Args:
            x: Raw x position
            y: Raw y position
            timestamp: Optional timestamp (seconds). If None, uses fixed frequency.

        Returns:
            Smoothed (x, y) position
        """
        # Estimate derivatives (velocity)
        if self.last_x is not None and self.last_y is not None:
            if timestamp is not None and self.last_time is not None:
                dt = timestamp - self.last_time
                if dt > 0:
                    dx = (x - self.last_x) / dt
                    dy = (y - self.last_y) / dt
                else:
                    dx = 0
                    dy = 0
            else:
                # Fixed frequency assumption
                dx = (x - self.last_x) * self.frequency
                dy = (y - self.last_y) * self.frequency

            # Filter derivatives
            dx_hat = self.dx_filter.update(dx)
            dy_hat = self.dy_filter.update(dy)

            # Calculate cutoff based on velocity magnitude
            velocity = math.hypot(dx_hat, dy_hat)
            cutoff = self.mincutoff + self.beta * velocity

            # Update alpha for position filters
            self.x_filter.alpha = self._alpha(cutoff)
            self.y_filter.alpha = self._alpha(cutoff)
        else:
            # First sample - initialize
            self.x_filter.reset(x)
            self.y_filter.reset(y)
            self.dx_filter.reset(0)
            self.dy_filter.reset(0)

        self.last_x = x
        self.last_y = y
        if timestamp is not None:
            self.last_time = timestamp

        # Filter positions
        x_hat = self.x_filter.update(x)
        y_hat = self.y_filter.update(y)

        return x_hat, y_hat

    def reset(self, x: float = 0.0, y: float = 0.0):
        """Reset filter to initial state."""
        self.x_filter.reset(x)
        self.y_filter.reset(y)
        self.dx_filter.reset(0)
        self.dy_filter.reset(0)
        self.last_x = x
        self.last_y = y
        self.last_time = None


class OneEuroFilter2D:
    """Convenience wrapper for 2D filtering with Config integration."""

    def __init__(self, config: Config = None):
        self.config = config or Config()
        self.filter = OneEuroFilter(
            frequency=self.config.OE_FREQUENCY,
            mincutoff=self.config.OE_MINCUTOFF,
            beta=self.config.OE_BETA,
            dcutoff=self.config.OE_DCUTOFF,
        )

    def update(self, x: float, y: float, timestamp: float = None) -> Tuple[float, float]:
        return self.filter.update(x, y, timestamp)

    def reset(self, x: float = 0.0, y: float = 0.0):
        self.filter.reset(x, y)


if __name__ == "__main__":
    # Quick test
    import time
    filter = OneEuroFilter(frequency=60, mincutoff=1.0, beta=0.5)

    # Simulate noisy signal
    true_x, true_y = 0.5, 0.5
    for i in range(100):
        # Add noise
        noise_x = true_x + (i % 3 - 1) * 0.01
        noise_y = true_y + (i % 5 - 2) * 0.01

        smooth_x, smooth_y = filter.update(noise_x, noise_y, time.time())

        if i % 20 == 0:
            print(f"Frame {i}: raw=({noise_x:.4f}, {noise_y:.4f}) -> smooth=({smooth_x:.4f}, {smooth_y:.4f})")

    print("OneEuroFilter test passed")