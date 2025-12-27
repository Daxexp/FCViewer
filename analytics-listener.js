// analytics-listener.js
// Include in analytics.html (the popup page).
// - Asks opener for data at load
// - Listens for analytics-update messages
// - Calls existing analyze/render pipeline in the analytics page
// If analyze/render functions are not yet defined, queue the payload and run when ready.

(function () {
  const ORIGIN = window.location.origin;
  let pendingPayload = null;
  let readyCheckTimer = null;

  // Try to process payload either by calling a global handler if present,
  // or by calling the common functions used by the analytics page:
  // analyze(), renderOverview(), renderTopList(), renderDailyTable(), renderStats(), renderCharts()
  function processPayload(payload) {
    if (!payload) return;
    // If the analytics page explicitly exposes a handler, call it
    if (typeof window.handleAnalyticsPayload === 'function') {
      try { window.handleAnalyticsPayload(payload); return true; } catch (e) { console.warn(e); }
    }

    // If core functions exist on the analytics page, call the pipeline
    const haveAnalyze = typeof window.analyze === 'function';
    const haveRenderOverview = typeof window.renderOverview === 'function';
    const haveRenderTopList = typeof window.renderTopList === 'function';
    const haveRenderDailyTable = typeof window.renderDailyTable === 'function';
    const haveRenderStats = typeof window.renderStats === 'function';
    const haveRenderCharts = typeof window.renderCharts === 'function';

    if (haveAnalyze && haveRenderOverview && haveRenderTopList && haveRenderDailyTable && haveRenderStats && haveRenderCharts) {
      try {
        const month = payload.month || 'All Months';
        const cat = payload.category || 'all';
        // call existing analyze() to compute results
        const analysis = window.analyze ? window.analyze(payload.transactions || [], payload.month, payload.category) : null;
        // If analyze returned a full analysis object, reuse it; otherwise call pipeline manually
        if (analysis) {
          window.renderOverview(`${month} • ${cat}`, analysis);
          window.renderTopList(analysis.topTxs || []);
          window.renderDailyTable(analysis.dailySeries || []);
          window.renderStats(analysis);
          window.renderCharts(analysis);
        } else {
          // Fallback: try to reuse the analytics page's loadAndRender() style usage:
          // Many analytics pages implement their own analyze/render functions; here we attempt to call them in order.
          const analysis2 = window.analyze ? window.analyze(payload.transactions || [], payload.month, payload.category) : null;
          if (analysis2) {
            window.renderOverview(`${month} • ${cat}`, analysis2);
          }
        }
        return true;
      } catch (e) {
        console.warn('processPayload error', e);
        return false;
      }
    }

    // Not ready to process yet
    return false;
  }

  // When a message arrives from opener
  window.addEventListener('message', (ev) => {
    try {
      if (ev.origin !== ORIGIN) return;
      const data = ev.data || {};
      if (data.type === 'analytics-update') {
        // attempt to process now
        const ok = processPayload(data);
        if (!ok) {
          // store pending
          pendingPayload = data;
          // start timer to check readiness
          if (!readyCheckTimer) {
            readyCheckTimer = setInterval(() => {
              if (processPayload(pendingPayload)) {
                clearInterval(readyCheckTimer);
                readyCheckTimer = null;
                pendingPayload = null;
              }
            }, 300);
          }
        }
      } else if (data.type === 'analytics-request') {
        // If opener asked for something (rare), ignore or respond with current data if available
      }
    } catch (e) { console.warn('analytics listener error', e); }
  });

  // Ask opener for initial data when loaded
  function requestInitialData() {
    try {
      if (window.opener && !window.opener.closed && window.opener.location.origin === ORIGIN) {
        window.opener.postMessage({ type: 'analytics-request' }, ORIGIN);
      }
    } catch (e) {
      // ignore cross-origin
    }
  }

  // Expose a manual API optionally
  window.requestAnalyticsSnapshot = requestInitialData;

  // on load, request initial data
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', requestInitialData);
  } else {
    requestInitialData();
  }
})();
