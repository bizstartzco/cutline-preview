import { mountShell } from './shell.js';
import { $, $$, api, clock, el, isBusy, isPreview, keyNotice, mountAccount, routes, toast } from './common.js';

const id = isPreview ? 'demo' : location.pathname.split('/').pop();
let project = null;
let openClipId = null;
let shownRev = null;
let gridSignature = '';
let timer;
let firstLoad = true;

const STAGE_OF = { queued: 'prepare', downloading: 'prepare', probing: 'prepare', audio: 'transcribe', transcribing: 'transcribe', analyzing: 'analyze', rendering: 'render' };
const STAGES = ['prepare', 'transcribe', 'analyze', 'render'];
const clipBusy = (clip) => clip.status === 'pending' || clip.status === 'rendering';
const scoreClass = (n) => (n >= 75 ? '' : n >= 55 ? 'mid' : 'low');
const ratio = (aspect) => aspect.replace(':', ' / ');

// ----- page -----
function paint() {
  document.title = `${project.title} | Clipping Clips`;
  $('#title').textContent = project.title;
  const meta = [];
  if (project.meta) meta.push(clock(project.meta.duration), `${project.meta.width}×${project.meta.height}`);
  meta.push(project.source.kind === 'link' ? 'Imported from a link' : project.source.name);
  $('#meta').textContent = meta.join(' · ');

  const busy = isBusy(project.status);
  $('#progress').hidden = !busy;
  $('#failed').hidden = project.status !== 'error';
  $('#add-clip').hidden = project.status !== 'done';

  if (busy) {
    const at = STAGES.indexOf(STAGE_OF[project.status]);
    $$('.stage-step').forEach((step, i) => {
      step.classList.toggle('past', i < at);
      step.classList.toggle('active', i === at);
    });
    // Each stage reports its own 0-1, so the bar fills once per stage.
    $('#bar').style.width = `${Math.max(3, project.progress * 100)}%`;
    $('#detail').textContent = project.detail || 'Working';
  }
  if (project.status === 'error') $('#error-text').textContent = project.error;

  paintGrid();
  if (openClipId) syncEditor();
}

function paintGrid() {
  const clips = [...project.clips].sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.idx - b.idx);
  const signature = JSON.stringify(clips.map((c) => [c.id, c.status, c.thumb, c.title, c.score, c.aspect, c.start, c.end]));
  if (signature === gridSignature) return;
  gridSignature = signature;
  $('#clips-head').hidden = !clips.length;
  $('#clips-head').textContent = clips.length ? `Clips (${clips.length})` : 'Clips';

  $('#clips').replaceChildren(
    ...clips.map((clip) => {
      const frame = el('div', { class: 'frame', style: `aspect-ratio:${ratio(clip.aspect)}` });
      if (clip.thumb && !clipBusy(clip)) frame.append(el('img', { src: routes.media(project.id, clip.thumb), alt: '', loading: 'lazy' }));
      else frame.append(el('div', { class: 'state', text: clip.status === 'error' ? 'Render failed' : 'Rendering' }));
      if (clip.score != null) frame.append(el('span', { class: `score ${scoreClass(clip.score)}`, title: 'Clip score, an AI estimate', text: String(clip.score) }));
      frame.append(el('span', { class: 'len', text: clock(clip.end - clip.start) }));
      return el(
        'button',
        { class: 'clip', type: 'button', onclick: () => openEditor(clip.id) },
        frame,
        el('h3', { text: clip.title }),
        el('p', { class: 'mono', text: `${clock(clip.start)} to ${clock(clip.end)}` }),
      );
    }),
  );
}

async function load() {
  clearTimeout(timer);
  try {
    project = await api(`/projects/${id}`);
  } catch (err) {
    $('#title').textContent = 'Project not found';
    $('#meta').textContent = err.message;
    $('#delete-project').hidden = true;
    return;
  }
  paint();
  // /p/<project>#<clip> opens straight into that clip.
  if (firstLoad && project.clips.some((c) => c.id === location.hash.slice(1))) openEditor(location.hash.slice(1));
  firstLoad = false;
  if (isBusy(project.status) || project.clips.some(clipBusy)) timer = setTimeout(load, 1500);
}

$('#retry').addEventListener('click', async () => {
  try {
    project = await api(`/projects/${id}/retry`, { method: 'POST' });
    paint();
    timer = setTimeout(load, 1000);
  } catch (err) {
    toast(err.message);
  }
});

$('#delete-project').addEventListener('click', async () => {
  if (!confirm('Delete this project, its video and all of its clips? This cannot be undone.')) return;
  try {
    await api(`/projects/${id}`, { method: 'DELETE' });
    location.href = routes.app();
  } catch (err) {
    toast(err.message);
  }
});

// ----- clip editor -----
const editor = $('#editor');
const form = $('#e-form');
const video = $('#e-video');
const current = () => project.clips.find((c) => c.id === openClipId);

function openEditor(clipId) {
  openClipId = clipId;
  shownRev = null;
  const clip = current();
  $('#e-title').value = clip.title;
  $('#e-description').value = clip.description || '';
  form.elements.captionStyle.value = clip.captionStyle;
  form.elements.aspect.value = clip.aspect;
  form.elements.layout.value = clip.layout;
  $('#e-focus').value = Math.round((clip.focusX ?? 0.5) * 100);
  $('#e-start').value = clip.start;
  $('#e-end').value = clip.end;
  for (const input of [$('#e-start'), $('#e-end')]) input.max = project.meta.duration;

  const scored = clip.scores && clip.score != null;
  $('#e-score-field').hidden = !scored;
  if (scored) {
    const rows = [['Overall', clip.score], ['Hook', clip.scores.hook], ['Flow', clip.scores.flow], ['Value', clip.scores.value], ['Reach', clip.scores.trend]];
    $('#e-bars').replaceChildren(...rows.map(([name, n]) => el('div', {}, el('span', { text: name }), el('span', { class: 'meter' }, el('i', { style: `width:${n}%` })), el('span', { class: 'mono', text: String(n) }))));
    $('#e-reason').textContent = clip.reason;
    $('#e-reason').hidden = !clip.reason;
  }
  paintWords(clip);
  syncEditor();
  refreshControls();
  editor.showModal();
  // Without this the browser focuses the video, the first focusable thing in the dialog.
  $('#e-close').focus();
}

function paintWords(clip) {
  $('#e-words').replaceChildren(
    ...clip.words.map((word) => {
      const input = el('input', { value: word.w, 'data-key': word.s.toFixed(3), 'aria-label': `Caption word at ${clock(word.s)}`, maxlength: 60 });
      input.dataset.saved = word.w;
      input.classList.toggle('muted', word.w === '');
      input.addEventListener('input', () => {
        input.classList.toggle('changed', input.value !== input.dataset.saved);
        input.classList.toggle('muted', input.value.trim() === '');
      });
      return input;
    }),
  );
  if (!clip.words.length) $('#e-words').append(el('span', { class: 'hint', text: 'No speech in this range.' }));
}

// Keeps the player and buttons in step with the clip as renders land.
function syncEditor() {
  const clip = current();
  if (!clip) return editor.close();
  const busy = clipBusy(clip);
  $('#e-save').disabled = busy;
  $('#e-save').textContent = busy ? 'Rendering' : 'Save changes';
  const download = $('#e-download');
  download.toggleAttribute('hidden', !clip.file || busy);
  if (clip.file) download.href = `${routes.media(project.id, clip.file)}?download=1`;
  if (clip.status === 'error') toast(`Render failed: ${clip.error}`);

  if (!busy && clip.file && shownRev !== clip.rev) {
    const firstPaint = shownRev === null;
    shownRev = clip.rev;
    video.src = routes.media(project.id, clip.file);
    video.poster = routes.media(project.id, clip.thumb);
    if (!firstPaint) {
      // A re-render may have re-trimmed the clip, so the word list is rebuilt from the server's copy.
      paintWords(clip);
      $('#e-start').value = clip.start;
      $('#e-end').value = clip.end;
      refreshControls();
      toast('Clip updated.');
    }
  }
}

function refreshControls() {
  $('#e-focus-field').hidden = form.elements.layout.value !== 'fill';
  const length = Number($('#e-end').value) - Number($('#e-start').value);
  $('#e-length').textContent = Number.isFinite(length) && length > 0 ? `${length.toFixed(1)}s` : '';
}
form.addEventListener('input', refreshControls);

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const clip = current();
  const edits = {};
  for (const input of $$('#e-words input')) {
    if (input.value !== input.dataset.saved) edits[input.dataset.key] = input.value.trim();
  }
  const body = {
    title: $('#e-title').value,
    description: $('#e-description').value,
    captionStyle: form.elements.captionStyle.value,
    aspect: form.elements.aspect.value,
    layout: form.elements.layout.value,
    focusX: Number($('#e-focus').value) / 100,
    start: Number($('#e-start').value),
    end: Number($('#e-end').value),
  };
  if (Object.keys(edits).length) body.edits = edits;
  try {
    project = await api(`/projects/${id}/clips/${clip.id}`, { method: 'PATCH', body });
    paint();
    if (clipBusy(current())) {
      video.pause();
      toast('Rendering your changes.');
      clearTimeout(timer);
      timer = setTimeout(load, 1000);
    } else {
      toast('Saved.');
    }
  } catch (err) {
    toast(err.message);
  }
});

$('#e-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('#e-description').value);
    toast('Caption copied.');
  } catch {
    $('#e-description').select();
    toast('Press Ctrl+C to copy.');
  }
});

$('#e-delete').addEventListener('click', async () => {
  if (!confirm('Delete this clip? This cannot be undone.')) return;
  try {
    project = await api(`/projects/${id}/clips/${openClipId}`, { method: 'DELETE' });
    editor.close();
    paint();
  } catch (err) {
    toast(err.message);
  }
});

$('#e-close').addEventListener('click', () => editor.close());
editor.addEventListener('close', () => {
  video.pause();
  video.removeAttribute('src');
  video.load();
  openClipId = null;
});
// A click on the backdrop lands on the dialog element itself.
for (const dialog of [editor, $('#adder')]) dialog.addEventListener('click', (e) => e.target === dialog && dialog.close());

// ----- add a clip by time -----
const adder = $('#adder');
function seconds(text) {
  const parts = String(text).trim().split(':').map(Number);
  if (!parts.length || parts.length > 3 || parts.some((n) => !Number.isFinite(n) || n < 0)) return NaN;
  return parts.reduce((total, n) => total * 60 + n, 0);
}
$('#add-clip').addEventListener('click', () => {
  $('#a-hint').textContent = `Type times as minutes:seconds. This video runs ${clock(project.meta.duration)}.`;
  adder.showModal();
});
$('#a-close').addEventListener('click', () => adder.close());
$('#a-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const start = seconds($('#a-start').value);
  const end = seconds($('#a-end').value);
  if (!Number.isFinite(start) || !Number.isFinite(end) || $('#a-start').value.trim() === '' || $('#a-end').value.trim() === '') return toast('Type both times as minutes:seconds, for example 1:05.');
  try {
    project = await api(`/projects/${id}/clips`, { method: 'POST', body: { start, end, title: $('#a-title').value } });
    adder.close();
    paint();
    clearTimeout(timer);
    timer = setTimeout(load, 1000);
  } catch (err) {
    toast(err.message);
  }
});

api('/status')
  .then((status) => {
    const notice = keyNotice(status);
    if (notice) $('#notice').append(notice);
  })
  .catch(() => {});
mountShell('clips');
mountAccount();
load();
