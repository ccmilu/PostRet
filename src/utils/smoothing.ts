/**
 * Exponential Moving Average filter for time-series smoothing.
 *
 * Formula: smoothed = alpha * newValue + (1 - alpha) * previousSmoothed
 * First call returns the raw value.
 */
export class EMAFilter {
  private readonly alpha: number
  private value: number = 0
  private initialized: boolean = false

  constructor(alpha: number) {
    if (alpha < 0 || alpha > 1) {
      throw new RangeError(`alpha must be between 0 and 1, got ${alpha}`)
    }
    this.alpha = alpha
  }

  update(newValue: number): number {
    if (!this.initialized) {
      this.value = newValue
      this.initialized = true
      return this.value
    }

    this.value = this.alpha * newValue + (1 - this.alpha) * this.value
    return this.value
  }

  reset(): void {
    this.value = 0
    this.initialized = false
  }

  getValue(): number {
    return this.value
  }
}

/**
 * Jitter filter that suppresses small changes below a threshold.
 *
 * If |newValue - currentValue| < threshold, the old value is kept.
 * Otherwise the value updates to newValue.
 * First call returns the raw value.
 */
export class JitterFilter {
  private readonly threshold: number
  private value: number = 0
  private initialized: boolean = false

  constructor(threshold: number) {
    if (threshold < 0) {
      throw new RangeError(`threshold must be non-negative, got ${threshold}`)
    }
    this.threshold = threshold
  }

  update(newValue: number): number {
    if (!this.initialized) {
      this.value = newValue
      this.initialized = true
      return this.value
    }

    if (Math.abs(newValue - this.value) >= this.threshold) {
      this.value = newValue
    }

    return this.value
  }

  reset(): void {
    this.value = 0
    this.initialized = false
  }

  getValue(): number {
    return this.value
  }
}
