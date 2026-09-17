const API_URL = "https://script.google.com/macros/s/AKfycbz6s_68Qwa3B15eFVYveFM6j7q7in8Hv2gv32jCmNplVsaoRX1Oj1yFcffAIQtLHBJ0/exec";

const state = { voter: null, ballot: [], step: 0, picks: {} };
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const show = id => $$('.screen').forEach(x => x.classList.toggle('active', x.id === id));

async function api(action, payload = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...payload })
  });
  return res.json();
}

// -------- Login --------
$('#login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#login-btn');
  const err = $('#login-error');
  err.textContent = '';
  let phone = String(new FormData(e.target).get('phone') || '').replace(/\D/g, '');
  if (phone.length === 10) phone = '0' + phone;
  if (!/^0\d{10}$/.test(phone)) { err.textContent = 'Enter a valid phone number.'; return; }

  btn.disabled = true;
  btn.textContent = 'VERIFYING…';
  try {
    const r = await api('verifyVoter', { phone });
    if (!r.success) { err.textContent = r.message; return; }
    state.voter = { id: r.voter_id, name: r.name };
    $('#welcome-name').textContent = 'Welcome, ' + r.name;
    const b = await api('getBallot');
    if (!b.success) { err.textContent = b.message; return; }
    state.ballot = b.positions;
    state.step = 0;
    state.picks = {};
    renderStep();
    show('screen-ballot');
  } catch (ex) {
    err.textContent = 'Network error. Try again.';
  } finally {
    btn.disabled = false;
    btn.textContent = 'CONTINUE';
  }
});

// -------- Ballot render --------
function renderStep() {
  const pos = state.ballot[state.step];
  $('#progress').textContent = `STEP ${state.step + 1} OF ${state.ballot.length}`;
  $('#position-title').textContent = pos.name.toUpperCase();
  const grid = $('#nominee-grid');
  grid.innerHTML = '';
  pos.nominees.forEach((n, i) => {
    const card = document.createElement('article');
    card.className = 'nominee-card';
    card.style.animationDelay = (i * 60) + 'ms';
    card.dataset.id = n.id;
    card.innerHTML = `
      <div class="checkmark">✓</div>
      <img src="${n.photo || placeholder(n.name)}" alt="${escapeHtml(n.name)}"
           onerror="this.src='${placeholder(n.name)}'">
      <div class="card-body">
        <div class="card-name">${escapeHtml(n.name)}</div>
        <button class="select-btn" type="button">SELECT</button>
      </div>`;
    card.addEventListener('click', () => select(pos.name, n.id, card));
    grid.appendChild(card);
  });
  const picked = state.picks[pos.name];
  if (picked) {
    const c = grid.querySelector(`[data-id="${picked}"]`);
    if (c) c.classList.add('selected');
  }
  $('#continue-btn').disabled = !state.picks[pos.name];
  $('#back-btn').hidden = state.step === 0;
}

function select(positionName, nomineeId, card) {
  state.picks[positionName] = nomineeId;
  $$('#nominee-grid .nominee-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
  $('#continue-btn').disabled = false;
}

$('#back-btn').addEventListener('click', () => {
  if (state.step > 0) { state.step--; renderStep(); }
});
$('#continue-btn').addEventListener('click', () => {
  if (state.step < state.ballot.length - 1) { state.step++; renderStep(); }
  else { renderReview(); show('screen-review'); }
});

// -------- Review --------
function renderReview() {
  const ul = $('#review-list');
  ul.innerHTML = '';
  state.ballot.forEach(p => {
    const nid = state.picks[p.name];
    const n = p.nominees.find(x => x.id === nid) || { name: '—' };
    const li = document.createElement('li');
    li.innerHTML = `<span class="rv-pos">${escapeHtml(p.name)}</span>
                    <span class="rv-who">${escapeHtml(n.name)}</span>`;
    ul.appendChild(li);
  });
}
$('#change-btn').addEventListener('click', () => {
  state.step = state.ballot.length - 1;
  renderStep();
  show('screen-ballot');
});

// -------- Submit --------
$('#submit-btn').addEventListener('click', () => { $('#confirm-modal').hidden = false; });
$('#cancel-btn').addEventListener('click', () => { $('#confirm-modal').hidden = true; });
$('#confirm-btn').addEventListener('click', doSubmit);

let submitting = false;
async function doSubmit() {
  if (submitting) return;
  submitting = true;
  $('#confirm-modal').hidden = true;
  const btn = $('#submit-btn');
  btn.disabled = true;
  btn.textContent = 'Submitting…';

  const votes = state.ballot.map(p => ({
    position: p.name,
    nominee_id: state.picks[p.name]
  }));

  try {
    const r = await api('submitVote', { voter_id: state.voter.id, votes });
    if (!r.success) {
      if (r.error_code === 'ALREADY_VOTED') {
        $('#success-title').textContent = 'ALREADY VOTED';
        $('#success-sub').textContent = 'This phone number has already been used.';
        show('screen-success');
        return;
      }
      alert(r.message || 'Submission failed.');
      btn.disabled = false;
      btn.textContent = 'SUBMIT VOTE';
      return;
    }
    $('#success-title').textContent = 'VOTE RECORDED';
    $('#success-sub').textContent = 'Thank you, ' + state.voter.name + '.';
    show('screen-success');
  } catch (e) {
    alert('Could not reach the server. Your vote was NOT submitted.');
    btn.disabled = false;
    btn.textContent = 'SUBMIT VOTE';
  } finally {
    submitting = false;
  }
}

// -------- Helpers --------
function placeholder(name) {
  const initials = (name || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
    <rect width="100%" height="100%" fill="#1a3a6b"/>
    <text x="50%" y="55%" font-size="140" fill="#f2b705" text-anchor="middle"
      font-family="Arial" font-weight="bold">${initials}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
}
