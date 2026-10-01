import { mountShell } from './shell.js';
import { $, api, clock, el, isBusy, isPreview, keyNotice, mountAccount, openKeys, routes, STATUS_LABEL, toast } from './common.js';

const form = $('#new');
const fileInput = $('#file');
const drop = $('#drop');
const picked = $('#picked');
const go = $('#go');
const meter = $('#upload-meter');
let mode = 'upload';
let file = null;

// ----- source tabs -----
function setMode(next) {
  mode = next;
  for (const name of ['upload', 'link']) {
    $(`#tab-${name}`).setAttribute('aria-selected', String(name === mode));
    $(`#pane-${name}`).hidden = name !== mode;
  }
  describe();
}
$('#tab-upload').addEventListener('click', () => setMode('upload'));
$('#tab-link').addEventListener('click', () => setMode('link'));

function describe() {
  if (mode === 'upload') picked.textContent = file ? `${file.name} (${(file.size / 1048576).toFixed(1)} MB)` : 'No video chosen yet.';
  else picked.textContent = '';
}

function choose(candidate) {
  if (!candidate) return;
  if (!/\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(candidate.name)) return toast('That file type is not supported. Use MP4, MOV, MKV, WebM or AVI.');
  file = candidate;
  $('strong', drop).textContent = candidate.name;
  describe();
}
fileInput.addEventListener('change', () => choose(fileInput.files[0]));
for (const type of ['dragenter', 'dragover']) drop.addEventListener(type, (e) => (e.preventDefault(), drop.classList.add('over')));
for (const type of ['dragleave', 'drop']) drop.addEventListener(type, (e) => (e.preventDefault(), drop.classList.remove('over')));
drop.addEventListener('drop', (e) => choose(e.dataTransfer.files[0]));

const settings = () => ({
  aspect: form.elements.aspect.value,
  layout: form.elements.layout.value,
  captionStyle: form.elements.captionStyle.value,
  clipLength: form.elements.clipLength.value,
  language: $('#language').value,
  prompt: $('#prompt').value.trim(),
});

// XHR rather than fetch: it is the only way to report upload progress.
function upload(video, options) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/projects?name=${encodeURIComponent(video.name)}&settings=${encodeURIComponent(JSON.stringify(options))}`);
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      $('i', meter).style.width = `${(e.loaded / e.total) * 100}%`;
      picked.textContent = `Uploading ${Math.round((e.loaded / e.total) * 100)}%`;
    };
    xhr.onload = () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('The upload was interrupted. Is the Cutline server still running?'));
    xhr.send(video);
  });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (isPreview) return toast('This is a read-only preview. Uploading works in the installed app.');
  const link = $('#link').value.trim();
  if (mode === 'upload' && !file) return toast('Choose a video first.');
  if (mode === 'link' && !/^https?:\/\/\S+$/i.test(link)) return toast('Paste a full link that starts with http:// or https://');

  go.disabled = true;
  try {
    let project;
    if (mode === 'upload') {
      meter.hidden = false;
      project = await upload(file, settings());
    } else {
      project = await api('/projects/link', { method: 'POST', body: { url: link, settings: settings() } });
    }
    location.href = routes.project(project.id);
  } catch (err) {
    toast(err.message);
    go.disabled = false;
    meter.hidden = true;
    describe();
  }
});

// ----- project list -----
function card(project) {
  const ready = project.clips.filter((c) => c.thumb).slice(0, 3);
  const thumbs = el('div', { class: 'thumbs' });
  for (const clip of ready) thumbs.append(el('img', { src: routes.media(project.id, clip.thumb), alt: '', loading: 'lazy' }));
  for (let i = ready.length; i < 3; i++) thumbs.append(el('i'));

  const parts = [new Date(project.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })];
  if (project.meta?.duration) parts.push(clock(project.meta.duration));
  if (project.status === 'done') parts.push(`${project.clips.length} clip${project.clips.length === 1 ? '' : 's'}`);

  const busy = isBusy(project.status);
  return el(
    'a',
    { class: 'project', href: routes.project(project.id) },
    thumbs,
    el('div', {}, el('h3', { text: project.title }), el('p', { text: parts.join(' · ') })),
    el('span', { class: `pill ${busy ? 'busy' : project.status}`, text: STATUS_LABEL[project.status] || project.status }),
  );
}

let timer;
async function refresh() {
  clearTimeout(timer);
  try {
    const projects = await api('/projects');
    const list = $('#projects');
    list.replaceChildren(...(projects.length ? projects.map(card) : [el('div', { class: 'empty', text: 'Nothing here yet. Your first project will appear once you add a video.' })]));
    if (projects.some((p) => isBusy(p.status))) timer = setTimeout(refresh, 3000);
  } catch (err) {
    $('#projects').replaceChildren(el('div', { class: 'notice error', text: `Could not load projects: ${err.message}` }));
  }
}

// A link handed over from the landing page form.
const handed = new URLSearchParams(location.search).get('url');
if (handed) {
  $('#link').value = handed;
  setMode('link');
}

api('/status')
  .then((status) => {
    const notice = keyNotice(status);
    if (notice) $('#notice').append(notice);
    // Keys can be changed at any time from the top bar.
    if (!isPreview && !status.fixture && status.picker !== undefined) $('.bar nav').append(el('a', { href: '#keys', text: 'API keys', onclick: (e) => (e.preventDefault(), openKeys(status)) }));
    // The hosted version takes uploads only.
    if (status.public) $('.tabs').hidden = true;
    else if (!status.linkImport) $('#tab-link').title = 'Only direct video file links work until yt-dlp is installed.';
  })
  .catch(() => {});
mountShell('clips');
mountAccount();
refresh();
