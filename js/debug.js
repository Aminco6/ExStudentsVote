/**
 * debug.js — Frontend diagnostics for the election site.
 * Open the browser console to see the results.
 * Remove the <script src="./js/debug.js"></script> line from index.html
 * once everything works.
 */
(async function () {
  const cfgUrl = (window.API_URL || '').trim();
  const lines = [];
  const log = (label, val) => {
    const line = label + ': ' + val;
    lines.push(line);
    console.log('[DEBUG] ' + line);
  };

  console.log('%c==== ELECTION FRONTEND DEBUG ====', 'font-weight:bold;color:#2563eb');

  // 1. Config check
  log('Page URL', location.href);
  log('API_URL', cfgUrl || '(EMPTY)');
  if (!cfgUrl) {
    log('RESULT', '❌ API_URL is empty in js/app.js — paste your /exec URL');
    finish(); return;
  }
  if (cfgUrl.indexOf('PASTE_') === 0 || cfgUrl.indexOf('PASTE_APPS_SCRIPT') >= 0) {
    log('RESULT', '❌ API_URL still contains the placeholder text');
    finish(); return;
  }
  if (cfgUrl.indexOf('/dev') > -1) {
    log('RESULT', '❌ API_URL ends in /dev — must be /exec');
    finish(); return;
  }
  if (cfgUrl.indexOf('/exec') === -1) {
    log('RESULT', '⚠️ API_URL does not end in /exec — check for typos');
  }
  if (cfgUrl !== cfgUrl.replace(/\s/g, '')) {
    log('RESULT', '⚠️ API_URL contains whitespace — trim it');
  }

  // 2. Mixed content check
  if (location.protocol === 'http:' && cfgUrl.indexOf('https://') === 0) {
    log('RESULT', '❌ Site loaded over http:// but API is https:// — browsers block this');
  }

  // 3. GET test — simplest possible request
  log('---', 'Test 1: GET ?action=getBallot');
  try {
    const getUrl = cfgUrl + '?action=getBallot';
    const t0 = performance.now();
    const res = await fetch(getUrl, { method: 'GET', redirect: 'follow' });
    const ms = Math.round(performance.now() - t0);
    log('GET status', res.status + ' (' + ms + 'ms)');
    log('GET redirected to', res.url);
    const txt = await res.text();
    log('GET body (first 300 chars)', txt.slice(0, 300));
    if (txt.trim().startsWith('{')) {
      try {
        const j = JSON.parse(txt);
        log('GET parsed', JSON.stringify(j).slice(0, 200));
        log('RESULT', '✅ GET works — backend is reachable');
      } catch (e) { log('RESULT', '⚠️ GET returned invalid JSON'); }
    } else if (txt.trim().startsWith('<')) {
      log('RESULT', '❌ GET returned HTML (login page or error page) — deployment access is not "Anyone"');
    } else {
      log('RESULT', '❌ GET returned unrecognized body');
    }
  } catch (e) {
    log('GET threw', e.name + ' — ' + e.message);
    log('RESULT', '❌ GET fetch failed before reaching the server (CORS / DNS / mixed-content)');
  }

  // 4. POST test — what the site actually uses
  log('---', 'Test 2: POST {action:"getBallot"}');
  try {
    const t0 = performance.now();
    const res = await fetch(cfgUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'getBallot' }),
      redirect: 'follow'
    });
    const ms = Math.round(performance.now() - t0);
    log('POST status', res.status + ' (' + ms + 'ms)');
    log('POST redirected to', res.url);
    const txt = await res.text();
    log('POST body (first 300 chars)', txt.slice(0, 300));
    if (txt.trim().startsWith('{')) {
      try {
        const j = JSON.parse(txt);
        log('POST parsed', JSON.stringify(j).slice(0, 200));
        if (j.success === false && j.error_code === 'ELECTION_CLOSED') {
          log('RESULT', '✅ POST works — backend says election is CLOSED (set election_open = TRUE)');
        } else if (j.success === true) {
          log('RESULT', '✅ POST works — election is OPEN');
        } else {
          log('RESULT', '✅ POST works — backend returned: ' + (j.message || j.error_code));
        }
      } catch (e) { log('RESULT', '⚠️ POST returned invalid JSON'); }
    } else if (txt.trim().startsWith('<')) {
      log('RESULT', '❌ POST returned HTML — deployment access likely not "Anyone"');
    } else {
      log('RESULT', '❌ POST returned unrecognized body');
    }
  } catch (e) {
    log('POST threw', e.name + ' — ' + e.message);
    log('RESULT', '❌ POST fetch failed — this is what triggers "Network error. Try again."');
    if (String(e.message).toLowerCase().indexOf('cors') > -1) {
      log('FIX', 'Deploy → Manage deployments → ✏️ → Who has access: Anyone → Deploy');
    }
    if (String(e.message).toLowerCase().indexOf('failed to fetch') > -1) {
      log('FIX', 'Check that API_URL is exactly the /exec URL, no trailing slash, no spaces');
    }
    if (String(e.message).toLowerCase().indexOf('mixed') > -1) {
      log('FIX', 'Open the GitHub Pages site over https:// (not http://)');
    }
  }

  log('---', 'Test 3: verifyVoter with dummy phone (should NOT crash)');
  try {
    const res = await fetch(cfgUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'verifyVoter', phone: '08000000000' }),
      redirect: 'follow'
    });
    const txt = await res.text();
    log('verifyVoter status', res.status);
    log('verifyVoter body', txt.slice(0, 300));
    log('RESULT', '✅ verifyVoter endpoint responds');
  } catch (e) {
    log('verifyVoter threw', e.name + ' — ' + e.message);
  }

  finish();

  function finish() {
    console.log('%c==== SUMMARY ====', 'font-weight:bold;color:#2563eb');
    lines.forEach(l => console.log('  ' + l));

    // Also drop a visible banner on the page
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;bottom:0;left:0;right:0;max-height:40vh;overflow:auto;' +
      'background:#0f172a;color:#e2e8f0;font-family:monospace;font-size:11px;' +
      'padding:10px;z-index:9999;border-top:3px solid #2563eb;white-space:pre-wrap';
    box.textContent = '=== FRONTEND DEBUG ===\n' + lines.join('\n');
    document.body.appendChild(box);
  }
})();
