// analytics-client.js
// Include in the main page (e.g., finance_dashboard.html).
// - Opens/focuses analytics popup
// - Posts analytics-update payloads to popup
// - Replies to analytics-request messages from popup
// - Auto-creates a glassy "Open Analytics" button

(function () {
  const ANALYTICS_URL = 'analytics.html'; // adjust path if needed
  const ORIGIN = window.location.origin;
  let analyticsWindow = null;
  let watcherInterval = null;
  let lastSummaryHash = '';
  let lastTxCount = -1;

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
      if (!analyticsWindow || analyticsWindow.closed) return;
      const payload = buildAnalyticsPayload();
      analyticsWindow.postMessage(payload, ORIGIN);
    } catch (e) {
      // ignore
      console.warn('sendAnalyticsUpdate failed', e);
    }
  }

  function openAnalyticsPopup(url = ANALYTICS_URL) {
    try {
      if (!analyticsWindow || analyticsWindow.closed) {
        analyticsWindow = window.open(url, 'finance_analytics', 'width=1100,height=820');
        // After open, request analytics to initialise: send initial update after a short delay
        setTimeout(sendAnalyticsUpdate, 600);
      } else {
        analyticsWindow.focus();
        sendAnalyticsUpdate();
      }
      // start watcher if not started
      startWatcher();
    } catch (e) {
      console.error('openAnalyticsPopup error', e);
    }
  }

  // Reply to analytics page requests
  window.addEventListener('message', (ev) => {
    try {
      if (ev.origin !== ORIGIN) return;
      const data = ev.data || {};
      if (data.type === 'analytics-request') {
        // analytics popup asked for the current snapshot
        if (analyticsWindow && !analyticsWindow.closed) {
          analyticsWindow.postMessage(buildAnalyticsPayload(), ORIGIN);
        } else {
          // if popup not tracked, try to reply to event source
          if (ev.source && typeof ev.source.postMessage === 'function') {
            ev.source.postMessage(buildAnalyticsPayload(), ORIGIN);
          }
        }
      }
    } catch (e) {
      console.warn('message handler error', e);
    }
  });

  // Auto-create a small glassy "Open Analytics" button so you don't need to edit HTML
  function createOpenButton() {
    if (document.getElementById('openAnalyticsBtn')) return;
    const container = document.createElement('div');
    container.id = 'openAnalyticsBtn';
    container.style.position = 'fixed';
    container.style.right = '24px';
    container.style.bottom = '20px';
    container.style.zIndex = '9999';

    const btn = document.createElement('button');
    btn.innerText = 'Analytics';
    btn.title = 'Open Analytics';
    btn.onclick = () => openAnalyticsPopup();
    // glassy look (keeps same visual theme)
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
  }

  // Watch for changes in globalSummary / globalTransactions or dropdowns and auto-send updates
  function startWatcher() {
    if (watcherInterval) return;
    // initial values
    lastSummaryHash = JSON.stringify(window.globalSummary || {});
    lastTxCount = Array.isArray(window.globalTransactions) ? window.globalTransactions.length : -1;

    watcherInterval = setInterval(() => {
      try {
        const currentSummaryHash = JSON.stringify(window.globalSummary || {});
        const currentTxCount = Array.isArray(window.globalTransactions) ? window.globalTransactions.length : -1;

        const monthVal = document.getElementById('monthDropdown')?.value || window.currentMonth || 'All Months';
        const catVal = document.getElementById('categoryFilterTable')?.value || 'all';

        // if summary or tx changed, or dropdowns changed, send update
        if (currentSummaryHash !== lastSummaryHash || currentTxCount !== lastTxCount) {
          lastSummaryHash = currentSummaryHash;
          lastTxCount = currentTxCount;
          sendAnalyticsUpdate();
        }

        // Also listen for dropdown changes (in case other code replaced listeners)
        // Using attribute storage to detect changes
        const prevMonthAttr = document.documentElement.getAttribute('data-analytics-last-month') || '';
        const prevCatAttr = document.documentElement.getAttribute('data-analytics-last-cat') || '';
        if (prevMonthAttr !== monthVal || prevCatAttr !== catVal) {
          document.documentElement.setAttribute('data-analytics-last-month', monthVal);
          document.documentElement.setAttribute('data-analytics-last-cat', catVal);
          sendAnalyticsUpdate();
        }
      } catch (e) {
        // ignore
      }
    }, 1400);
  }

  // Attach listeners to dropdowns to notify analytics live
  function attachDropdownListeners() {
    const monthEl = document.getElementById('monthDropdown');
    const catEl = document.getElementById('categoryFilterTable');
    if (monthEl) monthEl.addEventListener('change', () => { sendAnalyticsUpdate(); });
    if (catEl) catEl.addEventListener('change', () => { sendAnalyticsUpdate(); });
  }

  // If you want the main page to push updates after init completes,
  // you can call window.sendAnalyticsUpdate() from your main init() function.
  // Expose functions globally:
  window.openAnalyticsPopup = openAnalyticsPopup;
  window.sendAnalyticsUpdate = sendAnalyticsUpdate;

  // bootstrap
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { createOpenButton(); attachDropdownListeners(); startWatcher(); });
  } else {
    createOpenButton(); attachDropdownListeners(); startWatcher();
  }
})();
