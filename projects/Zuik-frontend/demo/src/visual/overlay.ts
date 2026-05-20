/** Injected into the page for presentation-style demos (cursor + highlights). */
export const DEMO_OVERLAY_INIT = `(() => {
  if (window.__zuikDemoOverlay) return;
  const style = document.createElement('style');
  style.textContent = \`
    #zuik-demo-cursor {
      position: fixed; left: 0; top: 0; width: 22px; height: 22px;
      border-radius: 50%; pointer-events: none; z-index: 2147483646;
      border: 2px solid #7c5cff; background: rgba(124,92,255,0.25);
      box-shadow: 0 0 12px rgba(124,92,255,0.6);
      transform: translate(-50%, -50%);
      transition: left 0.35s cubic-bezier(0.22, 1, 0.36, 1),
                  top 0.35s cubic-bezier(0.22, 1, 0.36, 1);
      opacity: 0;
    }
    #zuik-demo-cursor.visible { opacity: 1; }
    .zuik-demo-highlight {
      outline: 2px solid #7c5cff !important;
      outline-offset: 3px !important;
      box-shadow: 0 0 0 4px rgba(124,92,255,0.2) !important;
      animation: zuik-demo-pulse 1.2s ease-in-out infinite;
    }
    @keyframes zuik-demo-pulse {
      0%, 100% { outline-color: #7c5cff; }
      50% { outline-color: #b794f6; }
    }
    #zuik-demo-banner {
      position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
      z-index: 2147483645; padding: 10px 18px; border-radius: 999px;
      background: rgba(12, 10, 20, 0.92); color: #f4f0ff;
      font: 500 13px/1.4 system-ui, sans-serif; border: 1px solid rgba(124,92,255,0.4);
      pointer-events: none; max-width: min(90vw, 520px); text-align: center;
    }
  \`;
  document.head.appendChild(style);

  const cursorEl = document.createElement('div');
  cursorEl.id = 'zuik-demo-cursor';
  document.body.appendChild(cursorEl);

  const banner = document.createElement('div');
  banner.id = 'zuik-demo-banner';
  banner.style.display = 'none';
  document.body.appendChild(banner);

  let highlightEl = null;

  window.__zuikDemoOverlay = {
    moveCursor(x, y) {
      cursorEl.style.left = x + 'px';
      cursorEl.style.top = y + 'px';
      cursorEl.classList.add('visible');
    },
    hideCursor() { cursorEl.classList.remove('visible'); },
    highlight(selector) {
      if (highlightEl) highlightEl.classList.remove('zuik-demo-highlight');
      const el = document.querySelector(selector);
      if (!el) return false;
      el.classList.add('zuik-demo-highlight');
      highlightEl = el;
      const r = el.getBoundingClientRect();
      this.moveCursor(r.left + r.width / 2, r.top + r.height / 2);
      return true;
    },
    clearHighlight() {
      if (highlightEl) highlightEl.classList.remove('zuik-demo-highlight');
      highlightEl = null;
    },
    banner(text) {
      banner.textContent = text;
      banner.style.display = text ? 'block' : 'none';
    },
  };
})();`
