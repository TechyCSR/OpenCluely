/**
 * 4-Corner Hover-Dwell Drag & Drop Manager
 *
 * Provides touchless window moving across all four corners of overlay windows (e.g. AI Response).
 * - Hovering cursor over any corner for 3 seconds hooks the window to the cursor.
 * - Moving the cursor freely drags the window to any location on screen.
 * - Holding the cursor stationary for 3 seconds unhooks and permanently locks the window at that location.
 */

(function () {
  'use strict';

  function initCornerHoverDrag(targetWindowName = 'llmResponse') {
    if (document.getElementById('corner-hover-drag-styles')) {
      // Already initialized in this document
      return;
    }

    // Inject CSS
    const styleEl = document.createElement('style');
    styleEl.id = 'corner-hover-drag-styles';
    styleEl.textContent = `
      /* 4-Corner Hover-Drag Handles */
      .window-corner-handle {
        position: absolute;
        width: 18px;
        height: 18px;
        z-index: 9999;
        -webkit-app-region: no-drag !important;
        cursor: default !important;
        opacity: 0.35;
        transition: opacity 0.2s ease, transform 0.15s ease;
        box-sizing: border-box;
        user-select: none;
        display: flex;
        pointer-events: auto !important;
      }

      .window-corner-handle:hover {
        opacity: 1 !important;
        transform: scale(1.15);
      }

      .window-corner-handle.top-left {
        top: 2px;
        left: 2px;
        align-items: flex-start;
        justify-content: flex-start;
        padding: 2px;
      }
      .window-corner-handle.top-left::after {
        content: '';
        width: 7px;
        height: 7px;
        border-top: 2px solid rgba(255, 255, 255, 0.75);
        border-left: 2px solid rgba(255, 255, 255, 0.75);
        border-top-left-radius: 3px;
        display: block;
        cursor: default !important;
      }

      .window-corner-handle.top-right {
        top: 2px;
        right: 2px;
        align-items: flex-start;
        justify-content: flex-end;
        padding: 2px;
      }
      .window-corner-handle.top-right::after {
        content: '';
        width: 7px;
        height: 7px;
        border-top: 2px solid rgba(255, 255, 255, 0.75);
        border-right: 2px solid rgba(255, 255, 255, 0.75);
        border-top-right-radius: 3px;
        display: block;
        cursor: default !important;
      }

      .window-corner-handle.bottom-left {
        bottom: 2px;
        left: 2px;
        align-items: flex-end;
        justify-content: flex-start;
        padding: 2px;
      }
      .window-corner-handle.bottom-left::after {
        content: '';
        width: 7px;
        height: 7px;
        border-bottom: 2px solid rgba(255, 255, 255, 0.75);
        border-left: 2px solid rgba(255, 255, 255, 0.75);
        border-bottom-left-radius: 3px;
        display: block;
        cursor: default !important;
      }

      .window-corner-handle.bottom-right {
        bottom: 2px;
        right: 2px;
        align-items: flex-end;
        justify-content: flex-end;
        padding: 2px;
      }
      .window-corner-handle.bottom-right::after {
        content: '';
        width: 7px;
        height: 7px;
        border-bottom: 2px solid rgba(255, 255, 255, 0.75);
        border-right: 2px solid rgba(255, 255, 255, 0.75);
        border-bottom-right-radius: 3px;
        display: block;
        cursor: default !important;
      }

      /* Hover-Dwell Drag & Drop Progress Bar */
      .corner-drag-progress-bar {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 3px;
        background: rgba(255, 255, 255, 0.08);
        border-bottom-left-radius: 8px;
        border-bottom-right-radius: 8px;
        overflow: hidden;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.2s ease;
        z-index: 10001;
      }

      .corner-drag-progress-bar.is-visible {
        opacity: 1;
      }

      .corner-drag-progress-fill {
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg, #38bdf8, #818cf8, #34d399);
        box-shadow: 0 0 10px rgba(56, 189, 248, 0.9);
        transition: width 0.05s linear;
      }

      .corner-drag-status-badge {
        position: absolute;
        bottom: 12px;
        left: 50%;
        transform: translateX(-50%) translateY(4px);
        background: rgba(15, 23, 42, 0.92);
        border: 1px solid rgba(56, 189, 248, 0.45);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(12px);
        color: #38bdf8;
        font-size: 11px;
        font-weight: 600;
        padding: 4px 12px;
        border-radius: 6px;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.2s ease, transform 0.2s ease;
        white-space: nowrap;
        z-index: 10002;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      .corner-drag-status-badge.is-visible {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }

      body.is-hooked-corner-dragging {
        border-color: rgba(56, 189, 248, 0.8) !important;
        box-shadow: 0 0 25px rgba(56, 189, 248, 0.45) !important;
      }

      body.is-hooked-corner-dragging .window-corner-handle::after {
        border-color: #38bdf8 !important;
        animation: pulse-corner-handle 0.8s infinite alternate ease-in-out;
      }

      @keyframes pulse-corner-handle {
        from { transform: scale(1); opacity: 0.6; }
        to { transform: scale(1.4); opacity: 1; }
      }
    `;
    document.head.appendChild(styleEl);

    // Create Corner Elements
    const corners = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    const container = document.body;

    corners.forEach((pos) => {
      const handle = document.createElement('div');
      handle.className = `window-corner-handle ${pos}`;
      handle.title = 'Hold cursor here for 3s to drag window';
      container.appendChild(handle);
    });

    // Create Progress Bar & Badge
    const progressBar = document.createElement('div');
    progressBar.className = 'corner-drag-progress-bar';
    const progressFill = document.createElement('div');
    progressFill.className = 'corner-drag-progress-fill';
    progressBar.appendChild(progressFill);
    container.appendChild(progressBar);

    const statusBadge = document.createElement('div');
    statusBadge.className = 'corner-drag-status-badge';
    statusBadge.textContent = 'Hold 3s to pick up...';
    container.appendChild(statusBadge);

    // Dwell State
    let isHooked = false;
    let hoverStartTime = null;
    let hoverAnimFrame = null;
    const dwellDuration = 3000;

    const cancelHoverHook = () => {
      if (isHooked) return;
      if (hoverAnimFrame) {
        cancelAnimationFrame(hoverAnimFrame);
        hoverAnimFrame = null;
      }
      hoverStartTime = null;
      progressBar.classList.remove('is-visible');
      statusBadge.classList.remove('is-visible');
      progressFill.style.width = '0%';
    };

    const startHoverHook = () => {
      if (isHooked) return;
      hoverStartTime = performance.now();
      progressBar.classList.add('is-visible');
      statusBadge.textContent = 'Hold 3s to pick up...';
      statusBadge.classList.add('is-visible');

      const animate = () => {
        if (isHooked || !hoverStartTime) return;
        const elapsed = performance.now() - hoverStartTime;
        const progress = Math.min(elapsed / dwellDuration, 1.0);

        progressFill.style.width = `${progress * 100}%`;

        if (progress >= 1.0) {
          isHooked = true;
          hoverStartTime = null;
          document.body.classList.add('is-hooked-corner-dragging');

          progressFill.style.width = '0%';
          statusBadge.textContent = 'Moving with cursor... hold still 3s to place';

          if (window.electronAPI && window.electronAPI.startHoverDrag) {
            window.electronAPI.startHoverDrag(targetWindowName);
          }
          return;
        }

        hoverAnimFrame = requestAnimationFrame(animate);
      };

      hoverAnimFrame = requestAnimationFrame(animate);
    };

    const handleEls = container.querySelectorAll('.window-corner-handle');
    handleEls.forEach((el) => {
      el.addEventListener('mouseenter', startHoverHook);
      el.addEventListener('mouseleave', cancelHoverHook);
    });

    // Handle Escape key or window unhook cancel
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isHooked) {
        if (window.electronAPI && window.electronAPI.stopHoverDrag) {
          window.electronAPI.stopHoverDrag();
        }
        isHooked = false;
        document.body.classList.remove('is-hooked-corner-dragging');
        cancelHoverHook();
      }
    });

    // Listen to main process cursor tracking status during drag
    if (window.electronAPI && window.electronAPI.onHoverDragStatus) {
      window.electronAPI.onHoverDragStatus((status) => {
        if (!isHooked) return;
        if (status.isStationary) {
          progressFill.style.width = `${status.progress * 100}%`;
          const remaining = Math.max(1, Math.ceil(3 * (1 - status.progress)));
          statusBadge.textContent = `Placing in ${remaining}s...`;
        } else {
          progressFill.style.width = '0%';
          statusBadge.textContent = 'Moving with cursor... hold still 3s to place';
        }
      });
    }

    // Listen to unhook event when 3s dwell at new location completes
    if (window.electronAPI && window.electronAPI.onHoverDragUnhooked) {
      window.electronAPI.onHoverDragUnhooked((pos) => {
        if (!isHooked) return;
        isHooked = false;
        document.body.classList.remove('is-hooked-corner-dragging');

        progressFill.style.width = '100%';
        statusBadge.textContent = '✓ Locked & Saved';

        setTimeout(() => {
          if (!isHooked) {
            progressBar.classList.remove('is-visible');
            statusBadge.classList.remove('is-visible');
            progressFill.style.width = '0%';
          }
        }, 800);
      });
    }
  }

  window.initCornerHoverDrag = initCornerHoverDrag;
})();
