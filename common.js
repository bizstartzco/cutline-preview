// Shared by the app and project pages.
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === false || value == null) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  node.append(...children.filter((c) => c != null && c !== false));
  return node;
}

// The hosted read-only preview has no server. It sets window.CUTLINE_PREVIEW,
// which answers API calls from a saved project and changes where pages and media live.
const preview = window.CUTLINE_PREVIEW;
export const isPreview = Boolean(preview);
export const routes = {
  app: () => (preview ? 'app.html' : '/app'),
  project: (id) => (preview ? 'project.html' : `/p/${id}`),
  media: (projectId, file) => (preview ? `demo/${file}` : `/media/${projectId}/${file}`),
};

export async function api(path, { method = 'GET', body } = {}) {
  if (preview) return preview(path, method);
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  // The session ran out: send the visitor to sign in, then back to where they were.
  if (res.status === 401 && !path.startsWith('/auth/')) {
    location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
    return new Promise(() => {});
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export function clock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

let toastTimer;
export function toast(message) {
  $('.toast')?.remove();
  document.body.append(el('div', { class: 'toast', role: 'status', text: message }));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('.toast')?.remove(), 4200);
}

export const STATUS_LABEL = {
  queued: 'Queued',
  downloading: 'Downloading',
  probing: 'Reading video',
  audio: 'Transcribing',
  transcribing: 'Transcribing',
  analyzing: 'Finding moments',
  rendering: 'Rendering',
  done: 'Ready',
  error: 'Failed',
};
export const isBusy = (status) => !['done', 'error'].includes(status);

// Hosted mode: shows who is signed in, how much of the month's allowance is
// used, and a way out. Does nothing when Cutline runs on a personal computer.
export async function mountAccount() {
  if (isPreview) return null;
  const me = await api('/auth/me').catch(() => null);
  if (!me?.public || !me.user) return me;
  const { email, usedMinutes, limitMinutes } = me.user;
  const nav = $('.bar nav');
  if (!nav) return me;
  nav.append(
    el('span', { class: 'usage mono', title: `${email}: ${usedMinutes} of ${limitMinutes} minutes of video used this month`, text: `${usedMinutes} / ${limitMinutes} min` }),
    el('a', {
      href: '#',
      text: 'Sign out',
      onclick: async (e) => {
        e.preventDefault();
        await api('/auth/logout', { method: 'POST' }).catch(() => {});
        location.href = '/';
      },
    }),
  );
  return me;
}

// Says which keys are missing and offers the panel to add them.
export function keyNotice(status) {
  if (status.fixture) return null;
  // Visitors of the hosted version cannot fix a missing key, so they are told only that uploads are paused.
  if (status.public && status.picker === undefined) {
    return status.ready ? null : el('div', { class: 'notice', role: 'status' }, el('div', {}, el('strong', { text: 'Cutline is not accepting videos right now. ' }), 'Please try again later.'));
  }
  const missing = [];
  if (!status.transcription) missing.push('a speech-to-text key');
  if (!status.picker) missing.push('a Gemini or Anthropic key');
  if (!missing.length) return null;
  const box = el('div', { class: 'notice', role: 'status', style: 'align-items:center;justify-content:space-between;flex-wrap:wrap' });
  box.append(
    el('div', {}, el('strong', { text: 'Two keys are needed before a video can be processed. ' }), `Still missing: ${missing.join(' and ')}.`),
    el('button', { class: 'btn small accent', type: 'button', text: 'Add API keys', onclick: () => openKeys(status) }),
  );
  return box;
}

// The API keys panel. Keys go straight to the local server, which stores them
// in its .env file and checks each one; they are never shown again afterwards.
export function openKeys(status) {
  $('#keys')?.remove();
  const field = (id, label, placeholder, help, saved) =>
    el(
      'div',
      { class: 'field' },
      el('label', { for: `k-${id}`, text: label }),
      el('input', { class: 'input mono', id: `k-${id}`, type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: saved ? 'Saved. Paste a new key to replace it.' : placeholder }),
      el('span', { class: 'hint' }, ...help),
      el('span', { class: 'hint', id: `r-${id}`, role: 'status' }),
    );
  const link = (href, text) => el('a', { href, target: '_blank', rel: 'noopener', text });
  const provider = status.transcription;

  const form = el(
    'form',
    { class: 'editor-body', method: 'dialog', novalidate: true },
    el('div', { class: 'editor-top' }, el('p', { class: 'eyebrow', id: 'keys-heading', text: 'API keys' }), el('button', { class: 'btn ghost small', type: 'button', text: 'Close', onclick: () => dialog.close() })),
    el('p', { style: 'color:var(--ink-2);font-size:.9375rem', text: 'Cutline uses two outside services, billed to your own accounts. Keys are stored on this computer only.' }),
    field('gemini', 'Gemini key: picks the moments', 'AIza...', ['Create one at ', link('https://aistudio.google.com/apikey', 'aistudio.google.com'), '. Used first when saved.'], status.gemini),
    field('anthropic', 'Anthropic key: picks the moments if there is no Gemini key', 'sk-ant-...', ['Create one at ', link('https://console.anthropic.com/settings/keys', 'console.anthropic.com'), '.'], status.anthropic),
    field('groq', 'Groq key: turns speech into text', 'gsk_...', ['Create one at ', link('https://console.groq.com/keys', 'console.groq.com'), '. The free tier is enough to start.'], provider === 'groq'),
    el(
      'details',
      {},
      el('summary', { style: 'cursor:pointer;font-size:.875rem;color:var(--ink-2)', text: 'Use OpenAI or Deepgram for speech-to-text instead' }),
      el('div', { style: 'display:grid;gap:18px;margin-top:16px' }, field('openai', 'OpenAI key', 'sk-...', ['Used only if no Groq or Deepgram key is saved.'], provider === 'openai'), field('deepgram', 'Deepgram key', '', ['Takes priority over Groq and OpenAI if saved.'], provider === 'deepgram')),
    ),
    el('div', { class: 'editor-foot' }, el('button', { class: 'btn accent', type: 'submit', id: 'k-save', text: 'Save and check' })),
  );
  const dialog = el('dialog', { class: 'editor', id: 'keys', 'aria-labelledby': 'keys-heading', style: 'width:min(560px,100% - 24px)' }, form);

  const report = (id, result) => {
    const line = $(`#r-${id}`, dialog);
    line.textContent = result.ok ? 'Working.' : result.message;
    line.style.color = result.ok ? 'var(--good)' : '#ff9d83';
  };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {};
    for (const id of ['gemini', 'anthropic', 'groq', 'openai', 'deepgram']) {
      const value = $(`#k-${id}`, dialog).value.trim();
      if (value) body[id] = value;
    }
    const save = $('#k-save', dialog);
    save.disabled = true;
    save.textContent = 'Checking';
    try {
      const { test } = await api('/settings', { method: 'POST', body });
      // Each result is shown under the key that will actually be used.
      for (const id of ['gemini', 'anthropic', 'groq', 'openai', 'deepgram']) $(`#r-${id}`, dialog).textContent = '';
      report(test.picker.provider || 'gemini', test.picker);
      report(test.transcription.provider || 'groq', test.transcription);
      if (test.picker.ok && test.transcription.ok) {
        toast('Both keys work. You can process a video now.');
        setTimeout(() => location.reload(), 1600);
      }
    } catch (err) {
      toast(err.message);
    }
    save.disabled = false;
    save.textContent = 'Save and check';
  });
  dialog.addEventListener('click', (e) => e.target === dialog && dialog.close());
  document.body.append(dialog);
  dialog.showModal();
}
