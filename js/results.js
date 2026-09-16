const API_URL = "https://script.google.com/macros/s/AKfycbz6s_68Qwa3B15eFVYveFM6j7q7in8Hv2gv32jCmNplVsaoRX1Oj1yFcffAIQtLHBJ0/exec";
const $ = s => document.querySelector(s);

async function load() {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'getResults' })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    render(data);
  } catch (e) {
    $('#status').textContent = 'Could not load results';
  }
}

function render(data) {
  $('#election-name').textContent = data.election_name || 'Election Results';
  $('#status').textContent = data.is_open ? 'LIVE RESULTS' : 'FINAL RESULTS';
  $('#status').className = 'badge ' + (data.is_open ? 'live' : 'final');

  const wrap = $('#results');
  wrap.innerHTML = '';
  data.results.forEach((pos, i) => {
    const block = document.createElement('section');
    block.className = 'pos-block';
    block.style.animationDelay = (i * 80) + 'ms';
    const total = pos.candidates.reduce((a, c) => a + c.votes, 0);
    block.innerHTML = `<h3>${escapeHtml(pos.position.toUpperCase())}</h3>
      ${pos.candidates.map(c => {
        const pct = total > 0 ? (c.votes / total * 100) : 0;
        return `<div class="cand">
          <div class="cand-name">${escapeHtml(c.name)}</div>
          <div class="cand-votes">${c.votes} vote${c.votes === 1 ? '' : 's'}</div>
          <div class="bar"><span data-pct="${pct.toFixed(1)}"></span></div>
        </div>`;
      }).join('')}`;
    wrap.appendChild(block);
  });
  requestAnimationFrame(() => {
    wrap.querySelectorAll('.bar > span').forEach(b => {
      b.style.width = Math.max(2, Number(b.dataset.pct)) + '%';
    });
  });
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
}

load();
setInterval(load, 20000);
