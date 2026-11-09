/**
 * One Euro Filter for JavaScript
 * Based on: "The 1€ Filter: A Simple Speed-based Low-pass Filter for Noisy Input in Interactive Systems"
 * by Casiez et al. (2012)
 *
 * Adapts cutoff frequency based on signal velocity:
 * - Low speed: heavy smoothing (removes jitter)
 * - High speed: responsive (follows fast movements)
 */

export class LowPassFilter {
  constructor(alpha = 0.5) {
    this.alpha = alpha;
    this.y = 0;
    this.initialized = false;
  }

  update(x) {
    if (!this.initialized) {
      this.y = x;
      this.initialized = true;
      return x;
    }
    this.y = this.alpha * x + (1 - this.alpha) * this.y;
    return this.y;
  }

  reset(x = 0) {
    this.y = x;
    this.initialized = true;
  }
}

export class OneEuroFilter {
  /**
   * @param {Object} options
   * @param {number} options.frequency - Sampling frequency (Hz)
   * @param {number} options.mincutoff - Minimum cutoff frequency (Hz)
   * @param {number} options.beta - Cutoff frequency slope (responsiveness to speed)
   * @param {number} options.dcutoff - Derivative cutoff frequency (Hz)
   */
  constructor({ frequency = 60, mincutoff = 1.0, beta = 0.0, dcutoff = 1.0 } = {}) {
    this.frequency = frequency;
    this.mincutoff = mincutoff;
    this.beta = beta;
    this.dcutoff = dcutoff;

    this.xFilter = new LowPassFilter();
    this.yFilter = new LowPassFilter();
    this.dxFilter = new LowPassFilter();
    this.dyFilter = new LowPassFilter();

    this.lastX = null;
    this.lastY = null;
    this.lastTime = null;
  }

  _alpha(cutoff) {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    const te = 1.0 / this.frequency;
    return 1.0 / (1.0 + tau / te);
  }

  /**
   * Update filter with new position
   * @param {number} x - Raw x position
   * @param {number} y - Raw y position
   * @param {number} [timestamp] - Optional timestamp in seconds
   * @returns {[number, number]} Smoothed [x, y] position
   */
  update(x, y, timestamp = null) {
    // Estimate derivatives (velocity)
    if (this.lastX !== null && this.lastY !== null) {
      let dx, dy;

      if (timestamp !== null && this.lastTime !== null) {
        const dt = timestamp - this.lastTime;
        if (dt > 0) {
          dx = (x - this.lastX) / dt;
          dy = (y - this.lastY) / dt;
        } else {
          dx = 0;
          dy = 0;
        }
      } else {
        // Fixed frequency assumption
        dx = (x - this.lastX) * this.frequency;
        dy = (y - this.lastY) * this.frequency;
      }

      // Filter derivatives
      const dxHat = this.dxFilter.update(dx);
      const dyHat = this.dyFilter.update(dy);

      // Calculate cutoff based on velocity magnitude
      const velocity = Math.hypot(dxHat, dyHat);
      const cutoff = this.mincutoff + this.beta * velocity;

      // Update alpha for position filters
      this.xFilter.alpha = this._alpha(cutoff);
      this.yFilter.alpha = this._alpha(cutoff);
    } else {
      // First sample - initialize
      this.xFilter.reset(x);
      this.yFilter.reset(y);
      this.dxFilter.reset(0);
      this.dyFilter.reset(0);
    }

    this.lastX = x;
    this.lastY = y;
    if (timestamp !== null) {
      this.lastTime = timestamp;
    }

    // Filter positions
    const xHat = this.xFilter.update(x);
    const yHat = this.yFilter.update(y);

    return [xHat, yHat];
  }

  reset(x = 0, y = 0) {
    this.xFilter.reset(x);
    this.yFilter.reset(y);
    this.dxFilter.reset(0);
    this.dyFilter.reset(0);
    this.lastX = x;
    this.lastY = y;
    this.lastTime = null;
  }
}

export class OneEuroFilter2D {
  constructor(config = {}) {
    this.filter = new OneEuroFilter({
      frequency: config.frequency || 60,
      mincutoff: config.mincutoff || 1.0,
      beta: config.beta || 0.0,
      dcutoff: config.dcutoff || 1.0,
    });
  }

  update(x, y, timestamp = null) {
    return this.filter.update(x, y, timestamp);
  }

  reset(x = 0, y = 0) {
    this.filter.reset(x, y);
  }
}