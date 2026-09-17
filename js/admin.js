/* admin.js — Electoral results dashboard (password-protected, server-verified). */
(function () {
  'use strict';

  const API_URL = "https://script.google.com/macros/s/AKfycbz6s_68Qwa3B15eFVYveFM6j7q7in8Hv2gv32jCmNplVsaoRX1Oj1yFcffAIQtLHBJ0/exec";

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  const state = {
    password: sessionStorage.getItem('exa_admin_pw') || '',
    data: null
  };

  async function api(action, payload) {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action: action }, payload || {})),
      redirect: 'follow'
    });
    const text = await res.text();
    try { return JSON.parse(text); }
    catch (e) { throw new Error('Non-JSON response: ' + text.slice(0, 120)); }
  }

  // ---- Gate ----
  $('#gate-form').addEventListener('submit', async e => {
    e.preventDefault();
    const pw = new FormData(e.target).get('password');
    const err = $('#gate-error');
    err.textContent = '';
    try {
      const r = await api('adminLogin', { password: pw });
      if (!r.success) { err.textContent = r.message || 'Incorrect password.'; return; }
      state.password = pw;
      sessionStorage.setItem('exa_admin_pw', pw);
      $('#gate').style.display = 'none';
      $('#dashboard').style.display = 'block';
      load();
    } catch (ex) {
      err.textContent = 'Error: ' + ex.message;
    }
  });

  $('#lock-btn').addEventListener('click', () => {
    sessionStorage.removeItem('exa_admin_pw');
    state.password = '';
    state.data = null;
    $('#dashboard').style.display = 'none';
    $('#gate').style.display = 'block';
    $('#gate-form').reset();
  });

  // Auto-login if we have a cached password
  if (state.password) {
    $('#gate').style.display = 'none';
    $('#dashboard').style.display = 'block';
    load();
  }

  // ---- Load ----
  async function load() {
    try {
      const r = await api('getFullVotes', { password: state.password });
      if (!r.success) {
        if (r.error_code === 'FORBIDDEN') {
          sessionStorage.removeItem('exa_admin_pw');
          $('#dashboard').style.display = 'none';
          $('#gate').style.display = 'block';
          return;
        }
        alert(r.message || 'Failed to load.');
        return;
      }
      state.data = r;
      render();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  }

  // ---- Render ----
  function render() {
    const d = state.data;
    $('#election-title').textContent = d.election_name || 'Election Report';
    $('#election-status').textContent =
      (d.is_open ? '🟢 Election OPEN' : '🔴 Election CLOSED') +
      ' — Report generated ' + new Date().toLocaleString();

    // Stats
    const votedSet = new Set(d.votes.map(v => v.voter_id));
    $('#stats').innerHTML = [
      ['REGISTERED', d.voters.length],
      ['VOTED', votedSet.size],
      ['NOT VOTED', Math.max(0, d.voters.length - votedSet.size)],
      ['TURNOUT', d.voters.length ? Math.round(votedSet.size / d.voters.length * 100) + '%' : '0%'],
      ['TOTAL VOTE ROWS', d.votes.length]
    ].map(([l, n]) =>
      '<div class="stat-tile"><div class="n">' + n + '</div><div class="l">' + l + '</div></div>'
    ).join('');

    // Winners (only show if election is closed OR still tally)
    const winnerHtml = d.positions.map(pos => {
      const cands = d.candidates.filter(c => c.position === pos.name);
      if (!cands.length) return '';
      const sorted = cands.slice().sort((a, b) => b.votes - a.votes);
      const w = sorted[0];
      if (!w || w.votes === 0) {
        return '<div class="winner-card"><div class="position">' + esc(pos.name) +
          '</div><div class="name">— no votes yet —</div></div>';
      }
      return '<div class="winner-card">' +
        '<div class="position">' + esc(pos.name) + '</div>' +
        '<div class="name">🏆 ' + esc(w.name) + '</div>' +
        '<div class="votes">' + w.votes + ' vote' + (w.votes === 1 ? '' : 's') +
        ' · ' + w.percentage + '% of position total</div>' +
        '</div>';
    }).join('');
    $('#winners').innerHTML = winnerHtml;

    // Filter dropdown
    const sel = $('#filter-position');
    const currentVal = sel.value;
    sel.innerHTML = '<option value="">All positions</option>' +
      d.positions.map(p => '<option value="' + esc(p.name) + '">' + esc(p.name) + '</option>').join('');
    sel.value = currentVal;

    // Votes table
    renderVotesTable();

    // Voters table
    const votersByPositions = {};
    d.votes.forEach(v => {
      if (!votersByPositions[v.voter_id]) votersByPositions[v.voter_id] = new Set();
      votersByPositions[v.voter_id].add(v.position);
    });
    $('#voters-tbl tbody').innerHTML = d.voters.map(v => {
      const voted = votersByPositions[v.id];
      const votedText = voted ? Array.from(voted).join(', ') : '—';
      return '<tr>' +
        '<td>' + esc(v.id) + '</td>' +
        '<td>' + esc(v.name) + '</td>' +
        '<td>' + esc(v.phone) + '</td>' +
        '<td>' + (v.has_voted ? '✓ VOTED' : '○ NOT VOTED') + '</td>' +
        '<td>' + esc(votedText) + '</td>' +
        '</tr>';
    }).join('');
  }

  function renderVotesTable() {
    const filterPos = $('#filter-position').value;
    const filterVoter = ($('#filter-voter').value || '').toLowerCase();
    const rows = state.data.votes.filter(v => {
      if (filterPos && v.position !== filterPos) return false;
      if (filterVoter) {
        const hay = (v.voter_name + ' ' + v.voter_phone).toLowerCase();
        if (hay.indexOf(filterVoter) === -1) return false;
      }
      return true;
    });
    $('#row-count').textContent = rows.length + ' of ' + state.data.votes.length + ' rows';
    $('#votes-tbl tbody').innerHTML = rows.map(v =>
      '<tr>' +
        '<td>' + esc(v.timestamp) + '</td>' +
        '<td>' + esc(v.voter_id) + '</td>' +
        '<td>' + esc(v.voter_name) + '</td>' +
        '<td>' + esc(v.voter_phone) + '</td>' +
        '<td>' + esc(v.position) + '</td>' +
        '<td>' + esc(v.nominee_id) + '</td>' +
        '<td>' + esc(v.nominee_name) + '</td>' +
      '</tr>'
    ).join('');
  }

  $('#filter-position').addEventListener('change', renderVotesTable);
  $('#filter-voter').addEventListener('input', renderVotesTable);

  // ---- Actions ----
  $$('[data-act]').forEach(btn => {
    btn.addEventListener('click', () => handle(btn.dataset.act));
  });

  function handle(act) {
    if (!state.data) return;
    switch (act) {
      case 'refresh': return load();
      case 'csv-votes': return downloadVotesCsv();
      case 'csv-voters': return downloadVoterReportCsv();
      case 'csv-participation': return downloadParticipationCsv();
      case 'pdf': return downloadPdfReport();
    }
  }

  function downloadVotesCsv() {
    const rows = [['Timestamp', 'Voter ID', 'Voter Name', 'Voter Phone',
                   'Position', 'Nominee ID', 'Nominee Name']];
    state.data.votes.forEach(v => rows.push([
      v.timestamp, v.voter_id, v.voter_name, v.voter_phone,
      v.position, v.nominee_id, v.nominee_name
    ]));
    downloadText('full_votes_' + timestamp() + '.csv', toCsv(rows));
  }

  function downloadVoterReportCsv() {
    const byVoter = {};
    state.data.votes.forEach(v => {
      if (!byVoter[v.voter_id]) byVoter[v.voter_id] = [];
      byVoter[v.voter_id].push(v);
    });
    const rows = [['Voter ID', 'Voter Name', 'Voter Phone',
                   'Position', 'Nominee ID', 'Nominee Name', 'Timestamp']];
    state.data.voters.forEach(voter => {
      const votes = byVoter[voter.id] || [];
      if (!votes.length) {
        rows.push([voter.id, voter.name, voter.phone, '—', '—', '—', '—']);
      } else {
        votes.forEach(v => rows.push([
          voter.id, voter.name, voter.phone,
          v.position, v.nominee_id, v.nominee_name, v.timestamp
        ]));
      }
    });
    downloadText('voter_report_' + timestamp() + '.csv', toCsv(rows));
  }

  function downloadParticipationCsv() {
    const votedSet = new Set(state.data.votes.map(v => v.voter_id));
    const rows = [['Voter ID', 'Full Name', 'Phone', 'Has Voted']];
    state.data.voters.forEach(v => rows.push([
      v.id, v.name, v.phone, votedSet.has(v.id) ? 'VOTED' : 'NOT VOTED'
    ]));
    downloadText('participation_' + timestamp() + '.csv', toCsv(rows));
  }

  function downloadPdfReport() {
    // Build a printable HTML page and let the browser print-to-PDF it.
    const d = state.data;
    const votedSet = new Set(d.votes.map(v => v.voter_id));
    const turnout = d.voters.length ? Math.round(votedSet.size / d.voters.length * 100) + '%' : '0%';

    let html = '<!doctype html><html><head><meta charset="utf-8">' +
      '<title>' + esc(d.election_name) + ' — Official Report</title>' +
      '<style>' +
      'body{font-family:Arial,sans-serif;padding:30px;color:#111;font-size:12px}' +
      'h1{font-size:20px;text-align:center;margin:0 0 4px}' +
      'h2{font-size:15px;margin:24px 0 8px;border-bottom:1px solid #ccc;padding-bottom:4px}' +
      'h3{font-size:13px;margin:18px 0 6px;color:#1a3a6b}' +
      'table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:16px}' +
      'th,td{border:1px solid #ddd;padding:5px 7px;text-align:left}' +
      'th{background:#f4f4f4}' +
      '.stats span{display:inline-block;margin-right:20px;margin-bottom:6px}' +
      '.winner{background:#fef3c7;border-left:4px solid #f2b705;padding:10px 14px;margin-bottom:8px}' +
      '.winner b{font-size:14px}' +
      '.footer{margin-top:30px;font-size:10px;color:#777;text-align:center}' +
      '</style></head><body>';

    html += '<h1>EX-STUDENTS ASSOCIATION — OFFICIAL ELECTION REPORT</h1>';
    html += '<div style="text-align:center;color:#555;margin-bottom:20px">' +
      esc(d.election_name) + '</div>';

    html += '<h2>SUMMARY</h2><div class="stats">' +
      '<span><b>Registered Voters:</b> ' + d.voters.length + '</span>' +
      '<span><b>Votes Cast:</b> ' + votedSet.size + '</span>' +
      '<span><b>Turnout:</b> ' + turnout + '</span><br>' +
      '<span><b>Status:</b> ' + (d.is_open ? 'OPEN' : 'CLOSED') + '</span>' +
      '<span><b>Generated:</b> ' + new Date().toLocaleString() + '</span>' +
      '</div>';

    // Winners per position
    html += '<h2>WINNERS</h2>';
    d.positions.forEach(pos => {
      const cands = d.candidates.filter(c => c.position === pos.name)
        .slice().sort((a, b) => b.votes - a.votes);
      const w = cands[0];
      if (!w || w.votes === 0) {
        html += '<div class="winner"><b>' + esc(pos.name) + '</b>: — no votes —</div>';
      } else {
        html += '<div class="winner"><b>🏆 ' + esc(w.name) + '</b> — ' +
          esc(pos.name) + ' — ' + w.votes + ' vote' + (w.votes === 1 ? '' : 's') +
          ' (' + w.percentage + '%)</div>';
      }
    });

    // Per-position results
    d.positions.forEach(pos => {
      const cands = d.candidates.filter(c => c.position === pos.name)
        .slice().sort((a, b) => b.votes - a.votes);
      const total = cands.reduce((s, c) => s + c.votes, 0);
      html += '<h2>' + esc(pos.name.toUpperCase()) + '</h2>';
      html += '<table><tr><th>Nominee</th><th>Votes</th><th>Percentage</th></tr>';
      cands.forEach(c => {
        html += '<tr><td>' + esc(c.name) + '</td><td>' + c.votes +
          '</td><td>' + c.percentage + '%</td></tr>';
      });
      html += '<tr><th>Total</th><th>' + total + '</th><th>100%</th></tr></table>';
    });

    // Per-voter breakdown
    html += '<h2>VOTER BREAKDOWN</h2>';
    const byVoter = {};
    d.votes.forEach(v => {
      if (!byVoter[v.voter_id]) byVoter[v.voter_id] = [];
      byVoter[v.voter_id].push(v);
    });
    d.voters.forEach(voter => {
      const votes = byVoter[voter.id] || [];
      html += '<h3>' + esc(voter.name) + ' (' + esc(voter.phone) + ') — ID ' + esc(voter.id) + '</h3>';
      if (!votes.length) {
        html += '<div style="color:#999;font-size:11px">Did not vote</div>';
      } else {
        html += '<table><tr><th>Position</th><th>Voted For</th><th>Time</th></tr>';
        votes.forEach(v => {
          html += '<tr><td>' + esc(v.position) + '</td><td>' +
            esc(v.nominee_name) + ' (' + esc(v.nominee_id) + ')</td><td>' +
            esc(v.timestamp) + '</td></tr>';
        });
        html += '</table>';
      }
    });

    html += '<div class="footer">Report generated ' + new Date().toLocaleString() +
      ' — Ex-Students Election System</div></body></html>';

    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 400);
  }

  // ---- Helpers ----
  function toCsv(rows) {
    return rows.map(r => r.map(cell => {
      const s = String(cell == null ? '' : cell);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',')).join('\n');
  }
  function downloadText(filename, text) {
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function timestamp() {
    const d = new Date();
    return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0') + '_' +
      String(d.getHours()).padStart(2, '0') +
      String(d.getMinutes()).padStart(2, '0');
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[c]);
  }
})();
