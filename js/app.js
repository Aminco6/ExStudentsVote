/* app.js — hardened version.
   - Every DOM lookup is guarded.
   - Every handler is attached only if the element exists.
   - Any runtime error is shown on the page instead of silently failing.
*/

const API_URL = "https://script.google.com/macros/s/AKfycbz6s_68Qwa3B15eFVYveFM6j7q7in8Hv2gv32jCmNplVsaoRX1Oj1yFcffAIQtLHBJ0/exec";

(function () {
  'use strict';

  const state = { voter: null, ballot: [], step: 0, picks: {} };
  const $  = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const on = (sel, evt, fn) => {
    const el = $(sel);
    if (!el) { console.warn('[app.js] missing element:', sel); return null; }
    el.addEventListener(evt, fn);
    return el;
  };
  const show = id => {
    $$('.screen').forEach(x => x.classList.toggle('active', x.id === id));
  };

  // ---- Safe API wrapper. Surfaces real errors instead of hiding them. ----
  async function api(action, payload) {
    payload = payload || {};
    if (!API_URL || API_URL.indexOf('PASTE_') === 0) {
      throw new Error('API_URL is not configured in app.js');
    }
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action: action }, payload)),
      redirect: 'follow'
    });
    const text = await res.text();
    console.log('[api]', action, res.status, text.slice(0, 200));
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error('Server returned non-JSON (' + res.status + '): ' + text.slice(0, 120));
    }
  }

  // ---- Login ----
  on('#login-form', 'submit', async e => {
    e.preventDefault();
    const btn = $('#login-btn');
    const err = $('#login-error');
    if (err) err.textContent = '';
    const input = e.target.querySelector('input[name="phone"]');
    let phone = String(input ? input.value : '').replace(/\D/g, '');
    if (phone.length === 10) phone = '0' + phone;
    if (!/^0\d{10}$/.test(phone)) { if (err) err.textContent = 'Enter a valid phone number.'; return; }

    if (btn) { btn.disabled = true; btn.textContent = 'VERIFYING…'; }
    try {
      const r = await api('verifyVoter', { phone: phone });
      if (!r.success) { if (err) err.textContent = r.message || 'Verification failed.'; return; }
      state.voter = { id: r.voter_id, name: r.name };
      const w = $('#welcome-name'); if (w) w.textContent = 'Welcome, ' + r.name;

      const b = await api('getBallot');
      if (!b.success) { if (err) err.textContent = b.message || 'Ballot unavailable.'; return; }
      state.ballot = b.positions || [];
      state.step = 0;
      state.picks = {};
      if (!state.ballot.length) { if (err) err.textContent = 'No positions configured.'; return; }
      renderStep();
      show('screen-ballot');
    } catch (ex) {
      console.error('[login]', ex);
      if (err) err.textContent = 'Network error: ' + ex.message;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'CONTINUE'; }
    }
  });

  // ---- Ballot ----
  function renderStep() {
    const pos = state.ballot[state.step];
    if (!pos) return;
    const prog = $('#progress'); if (prog) prog.textContent = 'STEP ' + (state.step + 1) + ' OF ' + state.ballot.length;
    const title = $('#position-title'); if (title) title.textContent = (pos.name || '').toUpperCase();

    const grid = $('#nominee-grid');
    if (!grid) return;
    grid.innerHTML = '';
    (pos.nominees || []).forEach((n, i) => {
      const card = document.createElement('article');
      card.className = 'nominee-card';
      card.style.animationDelay = (i * 60) + 'ms';
      card.dataset.id = n.id;
      const img = n.photo || placeholder(n.name);
      card.innerHTML =
        '<div class="checkmark">✓</div>' +
        '<img src="' + img + '" alt="' + escapeHtml(n.name) + '">' +
        '<div class="card-body">' +
          '<div class="card-name">' + escapeHtml(n.name) + '</div>' +
          '<button class="select-btn" type="button">SELECT</button>' +
        '</div>';
      const imgel = card.querySelector('img');
      imgel.onerror = function () { this.src = placeholder(n.name); };
      card.addEventListener('click', function () { select(pos.name, n.id, card); });
      grid.appendChild(card);
    });

    const picked = state.picks[pos.name];
    if (picked) {
      const c = grid.querySelector('[data-id="' + picked + '"]');
      if (c) c.classList.add('selected');
    }
    const cont = $('#continue-btn'); if (cont) cont.disabled = !state.picks[pos.name];
    const back = $('#back-btn'); if (back) back.hidden = state.step === 0;
  }

  function select(positionName, nomineeId, card) {
    state.picks[positionName] = nomineeId;
    $$('#nominee-grid .nominee-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    const cont = $('#continue-btn'); if (cont) cont.disabled = false;
  }

  on('#back-btn', 'click', () => {
    if (state.step > 0) { state.step--; renderStep(); }
  });
  on('#continue-btn', 'click', () => {
    if (state.step < state.ballot.length - 1) { state.step++; renderStep(); }
    else { renderReview(); show('screen-review'); }
  });

  // ---- Review ----
  function renderReview() {
    const ul = $('#review-list'); if (!ul) return;
    ul.innerHTML = '';
    state.ballot.forEach(p => {
      const nid = state.picks[p.name];
      const n = (p.nominees || []).find(x => x.id === nid) || { name: '—' };
      const li = document.createElement('li');
      li.innerHTML =
        '<span class="rv-pos">' + escapeHtml(p.name) + '</span>' +
        '<span class="rv-who">' + escapeHtml(n.name) + '</span>';
      ul.appendChild(li);
    });
  }
  on('#change-btn', 'click', () => {
    state.step = state.ballot.length - 1;
    renderStep();
    show('screen-ballot');
  });

  // ---- Submit ----
  on('#submit-btn', 'click', () => { const m = $('#confirm-modal'); if (m) m.hidden = false; });
  on('#cancel-btn', 'click', () => { const m = $('#confirm-modal'); if (m) m.hidden = true; });
  on('#confirm-btn', 'click', doSubmit);

  let submitting = false;
  async function doSubmit() {
    if (submitting) return;
    submitting = true;
    const m = $('#confirm-modal'); if (m) m.hidden = true;
    const btn = $('#submit-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }

    const votes = state.ballot.map(p => ({ position: p.name, nominee_id: state.picks[p.name] }));

    try {
      const r = await api('submitVote', { voter_id: state.voter.id, votes: votes });
      if (!r.success) {
        if (r.error_code === 'ALREADY_VOTED') {
          const t = $('#success-title'); if (t) t.textContent = 'ALREADY VOTED';
          const s = $('#success-sub'); if (s) s.textContent = 'This phone number has already been used.';
          show('screen-success');
          return;
        }
        alert(r.message || 'Submission failed.');
        if (btn) { btn.disabled = false; btn.textContent = 'SUBMIT VOTE'; }
        return;
      }
      const t = $('#success-title'); if (t) t.textContent = 'VOTE RECORDED';
      const s = $('#success-sub'); if (s) s.textContent = 'Thank you, ' + state.voter.name + '.';
      show('screen-success');
    } catch (ex) {
      console.error('[submit]', ex);
      alert('Could not submit: ' + ex.message);
      if (btn) { btn.disabled = false; btn.textContent = 'SUBMIT VOTE'; }
    } finally {
      submitting = false;
    }
  }

  // ---- Helpers ----
  function placeholder(name) {
    const initials = (name || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">' +
      '<rect width="100%" height="100%" fill="#1a3a6b"/>' +
      '<text x="50%" y="55%" font-size="140" fill="#f2b705" text-anchor="middle" ' +
      'font-family="Arial" font-weight="bold">' + initials + '</text></svg>';
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[c]);
  }

  window.__APP_READY__ = true;
  console.log('[app.js] ready');
})();
