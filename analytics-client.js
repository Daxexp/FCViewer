// analytics-listener-fixed.js
// Include in analytics.html. It requests initial data safely and retries until it receives it.
// Keeps listening for analytics-update messages.

(function () {
  const ORIGIN = window.location.origin;
  let gotInitial = false;
  let retryHandle = null;
  let retryCount = 0;

  // Ask opener for data (safe same-origin)
  function requestInitialData() {
    try {
      if (window.opener && !window.opener.closed && window.opener.location.origin === ORIGIN) {
        window.opener.postMessage({ type: 'analytics-request' }, ORIGIN);
      } else {
        // If opener not present or cross-origin, do nothing — analytics page may still read opener globals if allowed
      }
    } catch (e) {
      // cross-origin or no opener
    }
  }

  // When analytics-update message arrives, process it (analytics page already has handler)
  window.addEventListener('message', (ev) => {
    try {
      if (ev.origin !== ORIGIN) return;
      const data = ev.data || {};
      if (data.type === 'analytics-update') {
        gotInitial = true;
        retryCount = 0;
        // if analytics page exposes handler use it, otherwise use fallback
        if (typeof window.handleAnalyticsPayload === 'function') {
          window.handleAnalyticsPayload(data);
        } else if (typeof window.__analytics_handlePayload === 'function') {
          window.__analytics_handlePayload(data);
        } else {
          // fallback: store to window so renderer can pick it up
          window.__analytics_pendingPayload = data;
        }
      } else if (data.type === 'analytics-request') {
        // main might accidentally send this — ignore
      }
    } catch (e) { console.warn('analytics-listener message error', e); }
  });

  // Repeatedly request initial data until received or until user closes
  function startRequestRetries() {
    if (retryHandle) return;
    retryHandle = setInterval(() => {
      if (gotInitial || retryCount > 8) { clearInterval(retryHandle); retryHandle = null; return; }
      requestInitialData();
      retryCount++;
    }, 700);
  }

  // On load, request initial and start retry
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { requestInitialData(); startRequestRetries(); });
  } else {
    requestInitialData(); startRequestRetries();
  }

  // When user closes popup it will just remain closed. Nothing else to do here.

  // Optional: expose a manual request function
  window.requestAnalyticsSnapshot = requestInitialData;
})();
