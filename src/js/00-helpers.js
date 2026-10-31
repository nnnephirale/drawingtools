(() => {
'use strict';

/* ════════════════════════════════════════════════════════════════════
   helpers
   ════════════════════════════════════════════════════════════════════ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const uid = () => Math.random().toString(36).slice(2, 9);
const hexRgb = hx => { const n = parseInt(hx.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
const lin = c => c.map(v => Math.pow(v, 2.2));
const mix3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const toHex = c => '#' + c.map(v => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
}
const ICON = {
  eye: '<svg class="i" viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.6"/></svg>',
  eyeOff: '<svg class="i" viewBox="0 0 24 24"><path d="M4 4l16 16M9.9 6A9.6 9.6 0 0112 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 01-2.7 3.4M6.4 7.6C3.9 9.4 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1"/></svg>',
  up: '<svg class="i" viewBox="0 0 24 24"><path d="M7 14l5-5 5 5"/></svg>',
  down: '<svg class="i" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5"/></svg>',
  del: '<svg class="i" viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17"/></svg>',
  dup: '<svg class="i" viewBox="0 0 24 24"><rect x="8.5" y="8.5" width="10" height="10" rx="2.5"/><path d="M15.5 8.5V7a2 2 0 00-2-2H7a2 2 0 00-2 2v6.5a2 2 0 002 2h1.5"/></svg>',
};

