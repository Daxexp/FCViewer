// analytics-client-fixed2.js
// Place in repo and include on the main page: <script src="/analytics-client-fixed2.js"></script>
// Tailored for https://fclook.pages.dev hosting.

(function () {
  const ANALYTICS_URL = 'https://fclook.pages.dev/analytics.html';
  const ORIGIN = 'https://fclook.pages.dev';
  let analyticsWindow = null;
  let watcherInterval = null;
  let lastSnapshot = '';

  function log(...args){ console.debug('[analytics-client]', ...args); }

  function buildAnalyticsPayload() {
    const monthEl = document.getElementById('monthDropdown');
    const catEl = document.getElementById('categoryFilterTable');

    const month = monthEl ? monthEl.value : (window.currentMonth || 'All Months');
    const category = catEl ? catEl.value : 'all';

    const summary = window.globalSummary ? JSON.parse(JSON.stringify(window.globalSummary)) : {};
    const transactions = Array.isArray(window.globalTransactions) ? window.globalTransactions.slice() : [];

    return {
      type: 'analytics-update',
      month,
      category,
      summary,
      transactions,
      sentAt: Date.now()
    };
  }

  function sendAnalyticsUpdate() {
    try {
      if (!analyticsWindow || analyticsWindow.closed) {
        log('No analytics popup window to send to.');
        return;
      }
      const payload = buildAnalyticsPayload();
      analyticsWindow.postMessage(payload, ORIGIN);
      log('Sent analytics-update to popup', { month: payload.month, category: payload.category, txCount: payload.transactions.length });
    } catch (e) {
      console.warn('[analytics-client] send failed', e);
    }
  }

  // open popup on user click - required to avoid popup blocking
  function openAnalyticsPopup() {
    try {
      if (!analyticsWindow || analyticsWindow.closed) {
        analyticsWindow = window.open(ANALYTICS_URL, 'finance_analytics', 'width=1100,height=820');
        log('Opened analytics popup', ANALYTICS_URL);
        // Send initial update after a short delay so popup has time to load listeners
        setTimeout(() => sendAnalyticsUpdate(), 700);
      } else {
        analyticsWindow.focus();
        sendAnalyticsUpdate();
      }
      startWatcher();
    } catch (e) {
      console.error('[analytics-client] open error', e);
    }
  }

  // Listen for analytics-request from popup, and for ack messages
  window.addEventListener('message', (ev) => {
    try {
      if (ev.origin !== ORIGIN) {
        // ignore other-origins
        return;
      }
      const data = ev.data || {};
      if (data.type === 'analytics-request') {
        log('Received analytics-request from popup; sending snapshot');
        // send to the event source if available
        const targetWin = ev.source || analyticsWindow;
        if (targetWin && typeof targetWin.postMessage === 'function') {
          targetWin.postMessage(buildAnalyticsPayload(), ORIGIN);
        }
      } else if (data.type === 'analytics-ack') {
        log('Received analytics-ack from popup', data);
      }
    } catch (e) {
      console.warn('[analytics-client] message handler error', e);
    }
  });

  // Create a visible glassy "Analytics" button (user must click it)
  function createOpenButton() {
    if (document.getElementById('openAnalyticsBtn')) return;
    const container = document.createElement('div');
    container.id = 'openAnalyticsBtn';
    container.style.position = 'fixed';
    container.style.right = '24px';
    container.style.bottom = '20px';
    container.style.zIndex = '9999';
    container.style.fontFamily = 'Inter, Arial, sans-serif';

    const btn = document.createElement('button');
    btn.innerText = 'Analytics';
    btn.title = 'Open Analytics';
    btn.onclick = () => openAnalyticsPopup();

    // Glassy styling (keeps with theme)
    btn.style.padding = '10px 14px';
    btn.style.borderRadius = '12px';
    btn.style.border = '1px solid rgba(255,255,255,0.35)';
    btn.style.background = 'linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0.06))';
    btn.style.backdropFilter = 'blur(6px)';
    btn.style.color = 'inherit';
    btn.style.cursor = 'pointer';
    btn.style.boxShadow = '0 8px 28px rgba(0,0,0,0.18)';
    btn.style.fontWeight = '600';
    btn.style.fontSize = '14px';

    container.appendChild(btn);
    document.body.appendChild(container);
    log('Analytics open button created');
  }

  // Watch for changes and send updates when popup exists
  function startWatcher() {
    if (watcherInterval) return;
    lastSnapshot = JSON.stringify({ s: window.globalSummary || {}, t: (window.globalTransactions||[]).length, m: document.getElementById('monthDropdown')?.value || '' , c: document.getElementById('categoryFilterTable')?.value || '' });

    watcherInterval = setInterval(() => {
      try {
        const snapshot = JSON.stringify({ s: window.globalSummary || {}, t: (window.globalTransactions||[]).length, m: document.getElementById('monthDropdown')?.value || '' , c: document.getElementById('categoryFilterTable')?.value || '' });
        if (snapshot !== lastSnapshot) {
          lastSnapshot = snapshot;
          if (analyticsWindow && !analyticsWindow.closed) {
            sendAnalyticsUpdate();
          } else {
            // popup not open; don't open automatically to avoid pop-up creation not by user
            log('Detected data change but analytics popup not open');
          }
        }
        if (analyticsWindow && analyticsWindow.closed) analyticsWindow = null;
      } catch (e) { /* ignore */ }
    }, 1200);
  }

  // add listeners to dropdowns for faster update
  function attachDropdownListeners() {
    const monthEl = document.getElementById('monthDropdown');
    const catEl = document.getElementById('categoryFilterTable');
    if (monthEl) monthEl.addEventListener('change', () => { sendAnalyticsUpdate(); });
    if (catEl) catEl.addEventListener('change', () => { sendAnalyticsUpdate(); });
  }

  // Expose functions for debugging / manual usage
  window.openAnalyticsPopup = openAnalyticsPopup;
  window.sendAnalyticsUpdate = sendAnalyticsUpdate;

  // bootstrap on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { createOpenButton(); attachDropdownListeners(); });
  } else {
    createOpenButton(); attachDropdownListeners();
  }

})();
