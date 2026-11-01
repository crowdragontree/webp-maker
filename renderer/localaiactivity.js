// a progress bar in the bottom right corner every time the local AI is reading your text (grammar check with the local AI).
// Nothing shows when an answer is already saved (the model is not asked again), and nothing shows when the local AI is off.
(function (root) {
  'use strict';
  const api = (root && root.juicyApp) || {}, doc = root && root.document;
  if (!doc || !api.onLocalaiActivity) return;
  let box = null, hideT = 0;
  const ensure = () => {
    if (box && box.isConnected) return box;
    box = doc.createElement('div'); box.id = 'lai-act'; box.className = 'lai-act'; box.hidden = true; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite');
    box.innerHTML = '<div class="aim-top"><b>The local AI is reading your text</b><span></span></div><div class="aim-bar"><i></i></div><div class="lai-note"></div>';
    (doc.body || doc.documentElement).appendChild(box); return box;
  };
  const paint = a => {
    const b = ensure(), total = Math.max(1, +a.total || 1), done = Math.min(total, +a.done || 0), loading = !!a.loading;
    b.classList.toggle('error', !!a.error); b.classList.toggle('done', a.state === 'end' && !a.error);
    b.querySelector('.aim-top b').textContent = a.state === 'end' ? (a.error ? 'The local AI could not finish reading' : 'The local AI finished reading') : (loading ? 'Starting the local AI' : 'The local AI is reading your text');
    b.querySelector('.aim-top span').textContent = a.state === 'end' && !a.error ? '' : `${Math.min(done + (a.state === 'end' ? 0 : 1), total)} of ${total}`;
    const bar = b.querySelector('.aim-bar i'); bar.style.width = (a.state === 'end' && !a.error ? 100 : loading ? Math.max(6, (done / total) * 100) : (done / total) * 100) + '%';
    b.classList.toggle('lai-loading', loading && a.state !== 'end');
    b.querySelector('.lai-note').textContent = a.error ? String(a.error).slice(0, 160) : (loading ? 'The first check of a session loads the model, which takes a little while.' : (a.live ? 'Checking the sentence you are writing.' : ''));
    b.hidden = false; clearTimeout(hideT);
  };
  api.onLocalaiActivity(a => {
    if (!a || !a.state) return;
    paint(a);
    if (a.state === 'end') hideT = setTimeout(() => { if (box) box.hidden = true; }, a.error ? 6000 : 1500);
  });
})(typeof window !== 'undefined' ? window : this);
