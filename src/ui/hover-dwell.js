/**
 * Hover Dwell Module — Rubic Stealth Interaction
 *
 * Supports BOTH immediate clicks AND 3-second hover dwell triggers.
 * Clicks execute immediately and cancel hover dwell.
 * Hover dwell shows a smooth perimeter progress ring and fires after 3 seconds.
 * Window dragging (mousedown/mouse movement with buttons held) immediately
 * cancels all hover dwells and prevents any accidental triggers.
 */

class HoverDwellManager {
  constructor() {
    this._enabled = true; // Enabled across all menu bar buttons
    this._dwellMs = 1000; // 1 second dwell duration
    this._attachments = new Map(); // element -> { action, timer, progressEl }
    this._isMouseDown = false;

    if (typeof window !== 'undefined') {
      // Whenever mouse button is pressed anywhere (e.g. dragging the window or clicking),
      // cancel any active dwell immediately
      window.addEventListener('mousedown', (e) => {
        this._isMouseDown = true;
        this.cancelAll();
      }, true);

      window.addEventListener('mouseup', () => {
        this._isMouseDown = false;
      }, true);

      // If user moves mouse with button pressed (dragging window), ensure no dwell runs
      window.addEventListener('mousemove', (e) => {
        if (this._isMouseDown || (e && e.buttons !== 0)) {
          this.cancelAll();
        }
      }, true);

      // In case native drag event starts
      window.addEventListener('dragstart', () => {
        this._isMouseDown = true;
        this.cancelAll();
      }, true);
    }
  }

  cancelAll() {
    this._attachments.forEach((data) => {
      this._cancelDwell(data);
    });
  }

  /**
   * Enable or disable hover-dwell mode globally.
   */
  setEnabled(enabled) {
    this._enabled = !!enabled;
    this.cancelAll();
  }

  isEnabled() {
    return this._enabled;
  }

  /**
   * Attach hover-dwell behavior to an element.
   * Both clicking AND 3-second hover dwell are supported simultaneously.
   * Clicking fires immediately and cancels any active hover dwell.
   * Dragging cancels hover dwell so window moves never trigger actions.
   *
   * @param {HTMLElement} element - The button/element to attach to
   * @param {Function} action - The callback to fire on dwell completion
   * @param {Object} [options] - Optional settings: { alwaysActive: boolean, dwellMs: number }
   */
  attach(element, action, options = {}) {
    if (!element || this._attachments.has(element)) return;

    const alwaysActive = options.alwaysActive !== false;
    const dwellMs = options.dwellMs || this._dwellMs;
    const progressEl = this._createProgressRing(element);

    const data = {
      action,
      dwellMs,
      timer: null,
      progressEl,
      startTime: null,
      animFrameId: null,
      alwaysActive,
    };

    // Mouse enter — start dwell timer unless dragging
    const onEnter = (e) => {
      if (this._isMouseDown || (e && e.buttons !== 0)) return; // Ignore if user is dragging
      if (!this._enabled && !data.alwaysActive) return;
      this._startDwell(data, element);
    };

    // Mouse move — cancel if mouse button is held
    const onMove = (e) => {
      if (this._isMouseDown || (e && e.buttons !== 0)) {
        this._cancelDwell(data);
      }
    };

    // Mouse leave — cancel dwell
    const onLeave = () => {
      this._cancelDwell(data);
    };

    // Click handler — normal clicks fire immediately!
    const onClick = () => {
      // User clicked directly — cancel hover dwell so it doesn't double-fire
      this._cancelDwell(data);
    };

    element.addEventListener('mouseenter', onEnter);
    element.addEventListener('mousemove', onMove);
    element.addEventListener('mouseleave', onLeave);
    element.addEventListener('click', onClick);

    data._onEnter = onEnter;
    data._onMove = onMove;
    data._onLeave = onLeave;
    data._onClick = onClick;

    this._attachments.set(element, data);
  }

  /**
   * Detach hover-dwell from an element.
   */
  detach(element) {
    const data = this._attachments.get(element);
    if (!data) return;

    this._cancelDwell(data);
    element.removeEventListener('mouseenter', data._onEnter);
    element.removeEventListener('mousemove', data._onMove);
    element.removeEventListener('mouseleave', data._onLeave);
    element.removeEventListener('click', data._onClick);

    if (data.progressEl && data.progressEl.parentNode) {
      data.progressEl.parentNode.removeChild(data.progressEl);
    }

    this._attachments.delete(element);
  }

  _startDwell(data, element) {
    this._cancelDwell(data);

    data.startTime = performance.now();

    if (data.progressEl) {
      data.progressEl.style.display = 'block';
    }

    const dwellDuration = data.dwellMs || this._dwellMs;

    const animate = () => {
      if (this._isMouseDown) {
        this._cancelDwell(data);
        return;
      }

      const elapsed = performance.now() - data.startTime;
      const progress = Math.min(elapsed / dwellDuration, 1);

      this._updateProgressRing(data.progressEl, progress);

      if (progress >= 1) {
        this._cancelDwell(data);
        this._flashComplete(element);
        try {
          data.action();
        } catch (err) {
          console.error('Error executing dwell action:', err);
        }
        return;
      }

      data.animFrameId = requestAnimationFrame(animate);
    };

    data.animFrameId = requestAnimationFrame(animate);
  }

  _cancelDwell(data) {
    if (data.animFrameId) {
      cancelAnimationFrame(data.animFrameId);
      data.animFrameId = null;
    }
    if (data.timer) {
      clearTimeout(data.timer);
      data.timer = null;
    }
    data.startTime = null;

    if (data.progressEl) {
      data.progressEl.style.display = 'none';
      this._updateProgressRing(data.progressEl, 0);
    }
  }

  _createProgressRing(element) {
    const computed = window.getComputedStyle(element);
    if (computed.position === 'static') {
      element.style.position = 'relative';
    }

    const ring = document.createElement('div');
    ring.className = 'rubic-dwell-ring';
    ring.style.display = 'none';
    ring.innerHTML = `
      <svg class="rubic-dwell-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        <rect class="rubic-dwell-bg" x="2" y="2" width="96" height="96" rx="8" ry="8" vector-effect="non-scaling-stroke"/>
        <rect class="rubic-dwell-progress" x="2" y="2" width="96" height="96" rx="8" ry="8" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100" vector-effect="non-scaling-stroke"/>
      </svg>
    `;
    element.appendChild(ring);
    return ring;
  }

  _updateProgressRing(progressEl, fraction) {
    if (!progressEl) return;
    const rect = progressEl.querySelector('.rubic-dwell-progress');
    if (!rect) return;
    const offset = Math.max(0, 100 * (1 - fraction));
    rect.style.strokeDashoffset = offset;
  }

  _flashComplete(element) {
    element.classList.add('rubic-dwell-fired');
    setTimeout(() => element.classList.remove('rubic-dwell-fired'), 400);
  }
}

// Export as singleton — shared across the main window UI
if (typeof window !== 'undefined') {
  window.RubicHoverDwell = window.RubicHoverDwell || new HoverDwellManager();
}
