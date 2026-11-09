/**
 * One Euro Filter for JavaScript
 * Based on: "The 1€ Filter: A Simple Speed-based Low-pass Filter for Noisy Input in Interactive Systems"
 * by Casiez et al. (2012)
 * Adapts cutoff frequency based on signal velocity
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

  update(x, y, timestamp = null) {
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
        dx = (x - this.lastX) * this.frequency;
        dy = (y - this.lastY) * this.frequency;
      }

      const dxHat = this.dxFilter.update(dx);
      const dyHat = this.dyFilter.update(dy);

      const velocity = Math.hypot(dxHat, dyHat);
      const cutoff = this.mincutoff + this.beta * velocity;

      this.xFilter.alpha = this._alpha(cutoff);
      this.yFilter.alpha = this._alpha(cutoff);
    } else {
      this.xFilter.reset(x);
      this.yFilter.reset(y);
      this.dxFilter.reset(0);
      this.dyFilter.reset(0);
    }

    this.lastX = x;
    this.lastY = y;
    if (timestamp !== null) this.lastTime = timestamp;

    return [this.xFilter.update(x), this.yFilter.update(y)];
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