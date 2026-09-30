const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

// ----- scroll reveal -----
// Nothing inside a <details> is tagged: an observer never fires for content in a closed one.
const reveal = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('in');
      reveal.unobserve(entry.target);
    }
  },
  { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
);
$$('.rv').forEach((node) => reveal.observe(node));

// ----- videos play only while on screen -----
const videos = $$('video.auto');
if (calm) {
  videos.forEach((video) => {
    video.removeAttribute('autoplay');
    video.pause();
    video.controls = !video.hasAttribute('aria-hidden');
  });
} else {
  const onScreen = new IntersectionObserver(
    (entries) => {
      for (const { target, isIntersecting } of entries) {
        if (isIntersecting) target.play().catch(() => {});
        else target.pause();
      }
    },
    { threshold: 0.15 },
  );
  videos.forEach((video) => onScreen.observe(video));
}

// ----- hero waveform: fixed pseudo-random bar heights so it looks the same every visit -----
const wave = $('#wave');
if (wave) {
  let seed = 7;
  const next = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const bars = innerWidth < 680 ? 56 : 110;
  for (let i = 0; i < bars; i++) {
    const bar = document.createElement('i');
    const swell = 0.55 + 0.45 * Math.sin(i / 6.5) ** 2;
    bar.style.setProperty('--h', String(Math.round(14 + next() * 62 * swell)));
    wave.append(bar);
  }
}

// ----- mobile menu -----
const burger = $('#burger');
const menu = $('#menu');
function setMenu(open) {
  burger.setAttribute('aria-expanded', String(open));
  burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  document.documentElement.style.overflow = open ? 'hidden' : '';
  if (open) {
    menu.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add('open')));
  } else {
    menu.classList.remove('open');
    setTimeout(() => {
      if (burger.getAttribute('aria-expanded') === 'false') menu.hidden = true;
    }, 500);
  }
}
burger.addEventListener('click', () => setMenu(burger.getAttribute('aria-expanded') !== 'true'));
menu.addEventListener('click', (e) => e.target.closest('a') && setMenu(false));
addEventListener('keydown', (e) => e.key === 'Escape' && burger.getAttribute('aria-expanded') === 'true' && setMenu(false));

// ----- reframe demo: step through the four shapes -----
const reframe = $('#reframe');
if (reframe) {
  const crops = $$('.crop', reframe);
  const chips = $$('.ratios span', reframe);
  let at = 0;
  const show = (i) => {
    at = i % crops.length;
    crops.forEach((c, j) => c.classList.toggle('on', j === at));
    chips.forEach((c, j) => c.classList.toggle('on', j === at));
  };
  if (!calm) setInterval(() => show(at + 1), 2400);
}

// ----- live caption demo, timed exactly like the rendered clips -----
const capVideo = $('#cap-video');
const capLine = $('#cap-line');
if (capVideo && capLine) {
  const words = 'Here is the question I ask every founder before we start.'.split(' ').map((w, i) => ({ w, s: 0.25 + i * 0.36, e: 0.25 + (i + 1) * 0.36 }));
  const RULES = { pop: { maxWords: 3, maxChars: 16 }, box: { maxWords: 4, maxChars: 22 }, clean: { maxWords: 6, maxChars: 30 } };
  const group = ({ maxWords, maxChars }) => {
    const lines = [];
    let line = [];
    let chars = 0;
    for (const word of words) {
      if (line.length && (line.length >= maxWords || chars + word.w.length + 1 > maxChars)) {
        lines.push(line);
        line = [];
        chars = 0;
      }
      line.push(word);
      chars += word.w.length + 1;
    }
    if (line.length) lines.push(line);
    return lines;
  };
  let style = 'pop';
  let lines = group(RULES[style]);
  let shown = '';

  const paint = () => {
    const t = capVideo.currentTime;
    const line = lines.find((l) => t >= l[0].s - 0.02 && t < l[l.length - 1].e + 0.3);
    const active = line?.findLast((w) => t >= w.s);
    const key = line ? `${style}|${line[0].s}|${active?.s}` : '';
    if (key !== shown) {
      shown = key;
      capLine.replaceChildren();
      if (line) {
        const holder = style === 'box' ? Object.assign(document.createElement('span'), { className: 'plate' }) : capLine;
        line.forEach((word, i) => {
          const span = document.createElement('span');
          span.textContent = word.w;
          if (word === active && style !== 'clean') span.className = 'on';
          holder.append(span, i < line.length - 1 ? ' ' : '');
        });
        if (holder !== capLine) capLine.append(holder);
      }
    }
    requestAnimationFrame(paint);
  };
  requestAnimationFrame(paint);

  $$('.cap-tabs button').forEach((button) =>
    button.addEventListener('click', () => {
      style = button.dataset.style;
      lines = group(RULES[style]);
      capLine.className = `cap-line s-${style}`;
      $$('.cap-tabs button').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
      if (calm) capVideo.play().catch(() => {});
    }),
  );
}

// ----- typed prompt -----
const typed = $('#typed');
if (typed) {
  const phrases = JSON.parse(typed.dataset.lines);
  if (calm) {
    typed.textContent = phrases[0];
  } else {
    let phrase = 0;
    let at = 0;
    let erasing = false;
    const tick = () => {
      const text = phrases[phrase];
      at += erasing ? -1 : 1;
      typed.textContent = text.slice(0, at);
      let wait = erasing ? 26 : 62;
      if (!erasing && at === text.length) {
        erasing = true;
        wait = 1900;
      } else if (erasing && at === 0) {
        erasing = false;
        phrase = (phrase + 1) % phrases.length;
        wait = 380;
      }
      setTimeout(tick, wait);
    };
    tick();
  }
}

// ----- pointer light on the bento cards, and buttons that lean toward the cursor -----
if (finePointer && !calm) {
  $$('.cell').forEach((cell) =>
    cell.addEventListener('pointermove', (e) => {
      const box = cell.getBoundingClientRect();
      cell.style.setProperty('--mx', `${e.clientX - box.left}px`);
      cell.style.setProperty('--my', `${e.clientY - box.top}px`);
    }),
  );
  $$('.magnet').forEach((button) => {
    button.addEventListener('pointermove', (e) => {
      const box = button.getBoundingClientRect();
      const x = (e.clientX - box.left - box.width / 2) * 0.18;
      const y = (e.clientY - box.top - box.height / 2) * 0.28;
      button.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    });
    button.addEventListener('pointerleave', () => (button.style.transform = ''));
  });
}

// ----- drag to scroll the footage rail -----
const rail = $('.rail');
if (rail && finePointer) {
  let startX = 0;
  let startScroll = 0;
  let dragging = false;
  rail.addEventListener('pointerdown', (e) => {
    dragging = true;
    startX = e.clientX;
    startScroll = rail.scrollLeft;
    rail.setPointerCapture(e.pointerId);
    rail.classList.add('drag');
  });
  rail.addEventListener('pointermove', (e) => {
    if (dragging) rail.scrollLeft = startScroll - (e.clientX - startX);
  });
  const stop = () => {
    dragging = false;
    rail.classList.remove('drag');
  };
  rail.addEventListener('pointerup', stop);
  rail.addEventListener('pointercancel', stop);
}
