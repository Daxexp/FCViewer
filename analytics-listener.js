// analytics-listener-fixed2.js
// Place in repo and include on analytics.html (popup).
// Tailored for https://fclook.pages.dev hosting.

(function () {
  const ORIGIN = 'https://fclook.pages.dev';
  let gotPayload = false;
  let retryCount = 0;
  let retryHandle = null;

  function log(...args){ console.debug('[analytics-listener]', ...args); }

  function processPayload(data){
    try {
      log('Processing payload', data && { month: data.month, category: data.category, txCount: (data.transactions||[]).length });
      // If analytics page exposes handler, call it:
      if (typeof window.handleAnalyticsPayload === 'function') {
        window.handleAnalyticsPayload(data);
      } else if (typeof window.__analytics_handlePayload === 'function') {
        window.__analytics_handlePayload(data);
      } else {
        // store for the renderer to pick up
        window.__analytics_pendingPayload = data;
        log('Stored payload to window.__analytics_pendingPayload for later processing by renderer');
      }
      // send ack back to opener if possible
      try {
        if (window.opener && !window.opener.closed && window.opener.location.origin === ORIGIN) {
          window.opener.postMessage({ type:'analytics-ack', receivedAt: Date.now(), txCount: (data.transactions||[]).length }, ORIGIN);
        }
      } catch(e){}
    } catch (e) {
      console.warn('[analytics-listener] process error', e);
    }
  }

  window.addEventListener('message', (ev) => {
    try {
      if (ev.origin !== ORIGIN) return;
      const d = ev.data || {};
      if (d.type === 'analytics-update') {
        gotPayload = true;
        processPayload(d);
      } else if (d.type === 'analytics-request') {
        // ignore; main might send by mistake
        log('Received analytics-request (ignored)');
      }
    } catch (e) { console.warn('[analytics-listener] message handler', e); }
  });

  function requestInitial(){
    try {
      if (window.opener && !window.opener.closed && window.opener.location.origin === ORIGIN) {
        log('Requesting initial snapshot from opener');
        window.opener.postMessage({ type: 'analytics-request' }, ORIGIN);
      } else {
        // try to read opener globals if same-origin access is allowed
        try {
          if (window.opener && !window.opener.closed && Array.isArray(window.opener.globalTransactions)) {
            const payload = { type:'analytics-update', month: window.opener.currentMonth || 'All Months', category: (window.opener.document.getElementById('categoryFilterTable')?.value || 'all'), transactions: window.opener.globalTransactions || [] };
            processPayload(payload);
            gotPayload = true;
          }
        } catch(e){}
      }
    } catch (e) {
      console.warn('[analytics-listener] requestInitial error', e);
    }
  }

  function startRetries(){
    if (retryHandle) return;
    retryHandle = setInterval(() => {
      if (gotPayload || retryCount > 8) { clearInterval(retryHandle); retryHandle = null; return; }
      retryCount++;
      requestInitial();
    }, 800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { requestInitial(); startRetries(); });
  } else {
    requestInitial(); startRetries();
  }

  // expose for debugging
  window.requestAnalyticsSnapshot = requestInitial;
})();
