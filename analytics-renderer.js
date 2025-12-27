// analytics-renderer.js
// Paste this into analytics.html (include after Chart.js and after the page markup).
// It listens for analytics-update payloads and renders detailed analytics reliably.

(function () {
  const ORIGIN = window.location.origin;
  let pendingPayload = null;
  let dailyChart = null;
  let catChart = null;

  // Helpers
  function parseAmount(v) {
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number') return v;
    const s = String(v).replace(/[,₹Rs\s]/g, '').trim();
    if (s === '') return 0;
    const n = Number(s);
    return isNaN(n) ? 0 : n;
  }
  function fmt(n) { return 'Rs. ' + (Math.round(n)).toLocaleString(); }
  function mean(a){ return a.length? a.reduce((s,x)=>s+x,0)/a.length : 0; }
  function median(a){ if(!a.length) return 0; const s=[...a].sort((u,v)=>u-v); const m=Math.floor(s.length/2); return s.length%2 ? s[m] : (s[m-1]+s[m])/2; }
  function stddev(a){ if(!a.length) return 0; const m=mean(a); return Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/a.length); }
  function dateKey(d){ const dt=new Date(d); if(isNaN(dt)) return null; return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`; }
  function dateFromKey(k){ const [y,mo,day]=k.split('-').map(Number); return new Date(y,mo-1,day); }
  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }
  function generatePalette(n){
    const base=['#FF6384','#36A2EB','#FFCE56','#8BC34A','#FF7043','#7E57C2','#26A69A','#FFB300','#8D6E63','#789262'];
    const res=[]; for(let i=0;i<n;i++) res.push(base[i%base.length]); return res;
  }

  // DOM references (match elements in analytics.html)
  const subtitleEl = document.getElementById('subtitle');
  const selLabelEl = document.getElementById('selLabel');
  const statCountEl = document.getElementById('statCount');
  const statTotalEl = document.getElementById('statTotal');
  const statExpensesEl = document.getElementById('statExpenses');
  const statIncomeEl = document.getElementById('statIncome');
  const rangeInfoEl = document.getElementById('rangeInfo');

  const avgPerDayEl = document.getElementById('avgPerDay');
  const avgPerTxEl = document.getElementById('avgPerTx');
  const medianTxEl = document.getElementById('medianTx');
  const stdDevEl = document.getElementById('stdDev');
  const busiestDayEl = document.getElementById('busiestDay');
  const avgWeekdayEl = document.getElementById('avgWeekday');

  const topTxList = document.getElementById('topTxList');
  const dailyTableBody = document.querySelector('#dailyTable tbody');
  const dailySummaryEl = document.getElementById('dailySummary');
  const catSummaryEl = document.getElementById('catSummary');

  const dailyCanvas = document.getElementById('dailyChart');
  const catCanvas = document.getElementById('catChart');

  // Core analytics pipeline
  function analyze(transactionsRaw, monthFilter, categoryFilter) {
    const txs = (transactionsRaw || []).map(t => ({
      date: t.date || t.Date || t.txDate || '',
      name: t.name || t.Name || t.payee || t.description || '',
      category: t.category || t.Category || 'Uncategorized',
      amount: parseAmount(t.amount ?? t.Amount ?? t.value ?? 0),
      note: t.note || t.Note || ''
    }));

    // Filter by month if needed
    let filtered = txs;
    if (monthFilter && monthFilter !== 'All Months') {
      const parts = monthFilter.split(' ');
      if (parts.length === 2) {
        const monthName = parts[0];
        const yearNum = Number(parts[1]);
        const monthIndex = new Date(`${monthName} 1, ${yearNum}`).getMonth();
        filtered = filtered.filter(t => {
          const dt = new Date(t.date);
          return !isNaN(dt) && dt.getFullYear() === yearNum && dt.getMonth() === monthIndex;
        });
      }
    }

    if (categoryFilter && categoryFilter !== 'all') {
      filtered = filtered.filter(t => (t.category||'').toString() === categoryFilter);
    }

    // Aggregate daily totals (include days with 0 if continuous range)
    const dayMap = new Map();
    const cats = new Map();
    const payees = new Map();
    const amounts = [];

    filtered.forEach(t => {
      const k = dateKey(t.date);
      if (!k) return;
      const ent = dayMap.get(k) || { total:0, count:0, txs:[] };
      ent.total += t.amount;
      ent.count += 1;
      ent.txs.push(t);
      dayMap.set(k, ent);

      const cat = (t.category||'Uncategorized').toString();
      cats.set(cat, (cats.get(cat) || 0) + t.amount);

      const pay = (t.name || '—').toString();
      payees.set(pay, (payees.get(pay) || 0) + t.amount);

      amounts.push(t.amount);
    });

    // date range
    const dayKeys = Array.from(dayMap.keys()).sort();
    let range = { start:null, end:null, days:0 };
    if (dayKeys.length) {
      range.start = dateFromKey(dayKeys[0]);
      range.end = dateFromKey(dayKeys[dayKeys.length-1]);
      range.days = Math.max(1, Math.round((range.end - range.start)/(24*3600*1000)) + 1);
    }

    // build dailySeries with filled days
    const dailySeries = [];
    if (range.days > 0) {
      let cur = new Date(range.start);
      for (let i=0;i<range.days;i++){
        const k = dateKey(cur);
        const v = dayMap.get(k) || { total:0, count:0, txs:[] };
        dailySeries.push({ date:k, total: v.total, count: v.count, txs: v.txs });
        cur.setDate(cur.getDate()+1);
      }
    }

    // summary values
    const totalSum = amounts.reduce((s,x)=>s+x,0);
    const income = Array.from(cats.entries()).filter(([k])=>k.trim().toLowerCase()==='income').reduce((s,[_k,v])=>s+v,0);
    const expense = totalSum - income; // if income positive and others positive, adjust as needed

    // top txs
    const topTxs = filtered.slice().sort((a,b)=>Math.abs(b.amount)-Math.abs(a.amount)).slice(0,10);

    // busiest day
    const busiest = dailySeries.length ? dailySeries.reduce((best,cur)=> !best || Math.abs(cur.total) > Math.abs(best.total) ? cur : best , null) : null;

    // weekday averages
    const weekdaySums = [0,0,0,0,0,0,0];
    const weekdayCounts = [0,0,0,0,0,0,0];
    dailySeries.forEach(d => {
      const dt = dateFromKey(d.date);
      const wd = dt.getDay();
      weekdaySums[wd] += d.total;
      weekdayCounts[wd] += 1;
    });
    const weekdayAvgs = weekdaySums.map((s,i)=> weekdayCounts[i] ? s/weekdayCounts[i] : 0);

    // percent changes & moving average (7-day)
    const totals = dailySeries.map(d => d.total);
    const moving7 = totals.map((_,i)=>{
      const start = Math.max(0, i-6);
      const slice = totals.slice(start, i+1);
      return slice.reduce((s,x)=>s+x,0)/slice.length;
    });

    // recurring payees (by count)
    const payeeCounts = {};
    filtered.forEach(t => { const p = t.name||'—'; payeeCounts[p] = (payeeCounts[p]||0)+1; });
    const topPayees = Object.entries(payeeCounts).map(([k,v])=>({payee:k,count:v})).sort((a,b)=>b.count-a.count).slice(0,8);

    // categories sorted
    const catArray = Array.from(cats.entries()).map(([k,v])=>({category:k,total:v}));
    catArray.sort((a,b)=>Math.abs(b.total)-Math.abs(a.total));

    // days with no transactions
    const daysNoTx = dailySeries.filter(d=>d.count===0).map(d=>d.date);

    // largest/smallest
    const largest = filtered.length ? filtered.reduce((a,b)=> Math.abs(b.amount) > Math.abs(a.amount) ? b : a) : null;
    const smallest = filtered.length ? filtered.reduce((a,b)=> Math.abs(b.amount) < Math.abs(a.amount) ? b : a) : null;

    return {
      filtered, dailySeries, catArray, topTxs, totalSum, income, expense,
      totalTx: filtered.length, avgPerDay: range.days ? (totals.reduce((s,x)=>s+x,0)/range.days) : 0,
      avgPerTx: filtered.length ? (totalSum/filtered.length) : 0,
      medianTx: median(amounts), stddev: stddev(amounts), busiest, weekdayAvgs, moving7,
      topPayees, daysNoTx, largest, smallest, range
    };
  }

  // Rendering functions
  function renderOverview(selText, analysis) {
    selLabelEl.textContent = selText;
    statCountEl.textContent = (analysis.totalTx || 0).toLocaleString();
    statTotalEl.textContent = fmt(analysis.totalSum || 0);
    statExpensesEl.textContent = fmt(Math.abs(analysis.expense || 0));
    statIncomeEl.textContent = fmt(analysis.income || 0);
    const r = analysis.range;
    rangeInfoEl.textContent = r && r.start ? `Range: ${r.start.toDateString()} — ${r.end.toDateString()} (${r.days} day${r.days>1?'s':''})` : 'Range: no data';
  }

  function renderTopList(topTxs) {
    topTxList.innerHTML = '';
    if (!topTxs.length) { topTxList.innerHTML = '<li style="color:var(--muted)">No transactions</li>'; return; }
    topTxs.forEach(t=>{
      const li = document.createElement('li');
      li.innerHTML = `<span style="color:var(--muted)">${escapeHtml(t.date)} — ${escapeHtml(t.name || t.category)}</span> <span class="highlight">${fmt(t.amount)}</span>`;
      topTxList.appendChild(li);
    });
  }

  function renderDailyTable(dailySeries) {
    dailyTableBody.innerHTML = '';
    dailySeries.forEach(d=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${d.date}</td><td>${fmt(d.total)}</td><td>${d.count}</td>`;
      dailyTableBody.appendChild(tr);
    });
  }

  function renderStats(analysis) {
    avgPerDayEl.textContent = fmt(analysis.avgPerDay || 0);
    avgPerTxEl.textContent = fmt(analysis.avgPerTx || 0);
    medianTxEl.textContent = fmt(analysis.medianTx || 0);
    stdDevEl.textContent = Math.round(analysis.stddev || 0).toLocaleString();
    busiestDayEl.textContent = analysis.busiest ? `${analysis.busiest.date} — ${fmt(analysis.busiest.total)}` : '—';
    avgWeekdayEl.textContent = analysis.weekdayAvgs.map((v,i)=>['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][i]+': '+fmt(v)).join(' ; ');
  }

  function renderCharts(analysis) {
    // Daily chart
    const labels = analysis.dailySeries.map(d=>d.date);
    const data = analysis.dailySeries.map(d=>Math.round(d.total));
    const ctx = dailyCanvas.getContext('2d');
    if (dailyChart) dailyChart.destroy();
    dailyChart = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ label:'Daily total', data, backgroundColor:'rgba(35,102,255,0.86)' }, { label:'7-day avg', data:analysis.moving7.map(x=>Math.round(x)), type:'line', borderColor:'#ffcd56', backgroundColor:'#ffcd56', fill:false, tension:0.3 }] },
      options: { responsive:true, plugins:{legend:{position:'top'}}, scales:{y:{beginAtZero:true}} }
    });

    // Category chart
    const catLabels = analysis.catArray.map(c=>c.category);
    const catData = analysis.catArray.map(c=>Math.round(c.total));
    const ctx2 = catCanvas.getContext('2d');
    if (catChart) catChart.destroy();
    catChart = new Chart(ctx2, {
      type: 'doughnut',
      data: { labels:catLabels, datasets:[{data:catData, backgroundColor: generatePalette(catLabels.length)}] },
      options: { responsive:true, plugins:{legend:{position:'right'}} }
    });

    dailySummaryEl.textContent = `Days: ${analysis.dailySeries.length}`;
    catSummaryEl.textContent = `Categories: ${analysis.catArray.length}`;
  }

  // Main orchestration: receive payload -> analyze -> render
  function handlePayload(payload) {
    if (!payload) return;
    const sel = `${payload.month || 'All Months'} • ${payload.category || 'all'}`;
    subtitleEl.textContent = `Based on: ${sel}`;
    selLabelEl.textContent = sel;

    const analysis = analyze(payload.transactions || [], payload.month, payload.category);
    renderOverview(sel, analysis);
    renderTopList(analysis.topTxs || []);
    renderDailyTable(analysis.dailySeries || []);
    renderStats(analysis);
    renderCharts(analysis);
  }

  // message listener
  window.addEventListener('message', (ev) => {
    try {
      if (ev.origin !== ORIGIN) return;
      const data = ev.data || {};
      if (data.type === 'analytics-update') {
        // immediate handle
        handlePayload(data);
      } else if (data.type === 'analytics-request') {
        // ignore (main requests from popup), but respond if needed (rare)
      }
    } catch (e) {
      console.warn('analytics-renderer message error', e);
    }
  });

  // If opener exists, request initial snapshot (safe same-origin)
  function requestInitial() {
    try {
      if (window.opener && !window.opener.closed && window.opener.location.origin === ORIGIN) {
        window.opener.postMessage({ type: 'analytics-request' }, ORIGIN);
      } else {
        // fallback: try to read opener's globals if same-origin access allowed
        if (window.opener && !window.opener.closed) {
          try {
            if (Array.isArray(window.opener.globalTransactions)) {
              // build ad-hoc payload and render
              const payload = {
                type: 'analytics-update',
                month: window.opener.currentMonth || 'All Months',
                category: document.getElementById('categoryFilterTable')?.value || 'all',
                transactions: window.opener.globalTransactions || []
              };
              handlePayload(payload);
            }
          } catch(e){}
        }
      }
    } catch(e) { /* ignore cross-origin */ }
  }

  // init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', requestInitial);
  } else {
    requestInitial();
  }

  // expose for debug
  window.__analytics_handlePayload = handlePayload;
})();
