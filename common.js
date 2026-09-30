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

// Says which keys are missing, in the words of the .env file the user will edit.
export function keyNotice(status) {
  if (status.fixture) return null;
  const missing = [];
  if (!status.transcription) missing.push(['OPENAI_API_KEY', ' (or GROQ_API_KEY or DEEPGRAM_API_KEY) for transcription']);
  if (!status.anthropic) missing.push(['ANTHROPIC_API_KEY', ' for picking moments']);
  if (!missing.length) return null;
  const box = el('div', { class: 'notice', role: 'status' });
  const text = el('div', {}, el('strong', { text: 'Add your API keys before processing a video. ' }), 'Open the ', el('code', { text: '.env' }), ' file in the Cutline folder and set ');
  missing.forEach(([key, what], i) => text.append(i ? ' and ' : '', el('code', { text: key }), what));
  text.append(', then restart the server.');
  box.append(text);
  return box;
}
