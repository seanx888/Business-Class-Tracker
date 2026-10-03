// Small view helpers shared by app.js and the feature screens (web/ui/*.js). Strings in, strings out — no state, no DOM.
import { t } from '../i18n.js';
import { icon } from '../icons.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function segmented(act, options, current, label) {
  return `<div class="segmented" role="group" aria-label="${esc(label)}">${options
    .map(([v, text]) => `<button data-act="${act}" data-v="${esc(v)}" aria-pressed="${current === v}">${esc(text)}</button>`)
    .join('')}</div>`;
}

export function chip(act, value, label, pressed, extraClass = '') {
  return `<button class="chip ${extraClass}" data-act="${act}" data-v="${esc(value)}" aria-pressed="${pressed}">${label}</button>`;
}

export function tag(text, cls = '', ic = '') {
  return `<span class="tag ${cls}">${ic ? icon(ic, { size: 14 }) : ''}${esc(text)}</span>`;
}

export function notice(text, warn = false) {
  return `<div class="notice${warn ? ' warn' : ''}">${icon(warn ? 'warning' : 'info')}<span>${esc(text)}</span></div>`;
}

export const skeleton = () => '<div class="skeleton"></div><div class="skeleton"></div>';

/** "3 hours ago" style age in the viewer's language, from an ISO time. */
export function ago(iso, now = Date.now()) {
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return '';
  const m = Math.round(ms / 60000);
  if (m < 60) return t('agoMin', { n: Math.max(1, m) });
  const h = Math.round(m / 60);
  if (h < 24) return t('agoHour', { n: h });
  return t('agoDay', { n: Math.round(h / 24) });
}

/** Whole days from today (Taipei date) to an ISO date; negative = already past. */
export const daysLeft = (iso, today) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);

/** A text area with the loaded/empty state used by the screens that read data files. */
export const emptyBox = (text) => `<div class="empty">${esc(text)}</div>`;
