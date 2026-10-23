import {DEFAULTS, HOURS_PER_SP, MAX_HOURS, estimate, parseHours, parseState, validateScenarios} from './model.js?v=e91c7c4503ce';
import {decimalSeparatorFor, localeFor, translate} from './i18n.js?v=453c98635621';

const $ = selector => document.querySelector(selector);
const keys = ['o', 'l', 'p'];
const fields = Object.fromEntries(keys.map(key => [key, $(`input[name="${key}"]`)]));
const touched = new Set();
let lang = document.documentElement.lang === 'en' ? 'en' : 'ru';
const t = (key, vars) => translate(lang, key, vars);
const formatters = new Map();
function fmt(value, digits = 2) {
  const cacheKey = `${lang}:${digits}`;
  let formatter = formatters.get(cacheKey);
  if (!formatter) {
    formatter = new Intl.NumberFormat(localeFor(lang), {maximumFractionDigits: digits});
    formatters.set(cacheKey, formatter);
  }
  return formatter.format(value);
}
let state = parseState(location.hash);
const isModelHash = hash => new URLSearchParams(hash.replace(/^#/, '')).has('m');

const themeMedia = window.matchMedia('(prefers-color-scheme: dark)');
let themePreference = null;
try {
  const saved = localStorage.getItem('prikidka.theme');
  if (saved === 'light' || saved === 'dark') themePreference = saved;
} catch {}

function applyTheme(theme) {
  const dark = theme === 'dark';
  document.documentElement.dataset.theme = theme;
  $('#theme-label').textContent = t(dark ? 'theme.light' : 'theme.dark');
  const action = t(dark ? 'theme.action.light' : 'theme.action.dark');
  $('#theme-toggle').setAttribute('aria-label', action);
  $('#theme-toggle').title = action;
  $('#theme-moon').toggleAttribute('hidden', dark);
  $('#theme-sun').toggleAttribute('hidden', !dark);
  $('meta[name="theme-color"]').content = dark ? '#111318' : '#f8fafc';
}
$('#theme-toggle').addEventListener('click', () => {
  themePreference = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(themePreference);
  try { localStorage.setItem('prikidka.theme', themePreference); } catch {}
});
themeMedia.addEventListener('change', event => {
  if (themePreference === null) applyTheme(event.matches ? 'dark' : 'light');
});

// Hover/focus reveals the explanation; a tap pins it until dismissed.
let activeHelp = null;
let helpHideTimer;
function placeHelp() {
  if (!activeHelp) return;
  const viewport = window.visualViewport;
  const viewLeft = viewport?.offsetLeft ?? 0;
  const viewTop = viewport?.offsetTop ?? 0;
  const viewWidth = viewport?.width ?? window.innerWidth;
  const viewHeight = viewport?.height ?? window.innerHeight;
  const margin = 12;
  activeHelp.popover.style.maxWidth = `${Math.max(1, viewWidth - margin * 2)}px`;
  activeHelp.popover.style.maxHeight = `${Math.max(1, viewHeight - margin * 2)}px`;
  const anchor = activeHelp.button.getBoundingClientRect();
  const box = activeHelp.popover.getBoundingClientRect();
  const left = Math.max(viewLeft + margin, Math.min(anchor.left - box.width / 2 + anchor.width / 2, viewLeft + viewWidth - box.width - margin));
  const above = anchor.top - box.height - 8;
  const top = above >= viewTop + margin ? above : anchor.bottom + 8;
  activeHelp.popover.style.left = `${left}px`;
  activeHelp.popover.style.top = `${Math.max(viewTop + margin, Math.min(top, viewTop + viewHeight - box.height - margin))}px`;
}
function closeHelp() {
  clearTimeout(helpHideTimer);
  if (!activeHelp) return;
  activeHelp.popover.hidden = true;
  activeHelp.button.setAttribute('aria-expanded', 'false');
  activeHelp = null;
}
function openHelp(button, pinned = false) {
  clearTimeout(helpHideTimer);
  if (activeHelp?.button === button) {
    activeHelp.pinned ||= pinned;
    return;
  }
  closeHelp();
  const popover = document.getElementById(button.getAttribute('aria-controls'));
  activeHelp = {button, popover, pinned};
  popover.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  placeHelp();
}
function scheduleHelpClose() {
  clearTimeout(helpHideTimer);
  helpHideTimer = setTimeout(() => {
    if (!activeHelp || activeHelp.pinned || document.activeElement === activeHelp.button
        || activeHelp.button.matches(':hover') || activeHelp.popover.matches(':hover')) return;
    closeHelp();
  }, 120);
}
for (const button of document.querySelectorAll('.help-trigger')) {
  const popover = document.getElementById(button.getAttribute('aria-controls'));
  button.addEventListener('pointerenter', event => {if (event.pointerType !== 'touch') openHelp(button);});
  button.addEventListener('focus', () => openHelp(button));
  button.addEventListener('click', () => {
    if (activeHelp?.button === button && activeHelp.pinned) closeHelp();
    else openHelp(button, true);
  });
  button.addEventListener('pointerleave', scheduleHelpClose);
  button.addEventListener('blur', () => {if (activeHelp?.button === button) closeHelp();});
  popover.addEventListener('pointerenter', () => clearTimeout(helpHideTimer));
  popover.addEventListener('pointerleave', scheduleHelpClose);
}
document.addEventListener('pointerdown', event => {
  if (activeHelp && !activeHelp.button.contains(event.target) && !activeHelp.popover.contains(event.target)) closeHelp();
});
document.addEventListener('keydown', event => {if (event.key === 'Escape') closeHelp();});
window.addEventListener('resize', placeHelp);
window.addEventListener('scroll', placeHelp, true);
window.visualViewport?.addEventListener('resize', placeHelp);
window.visualViewport?.addEventListener('scroll', placeHelp);

function displayed(value) {
  const digits = value < 0.01 ? 6 : 2;
  const rounded = Math.round(value * 10 ** digits) / 10 ** digits;
  const approximate = Math.abs(value - rounded) > Number.EPSILON * Math.max(1, value) * 4;
  return {text: `${approximate ? '≈ ' : ''}${fmt(value, digits)}`, approximate};
}

function syncInputs() {
  const separator = decimalSeparatorFor(lang);
  for (const key of keys) fields[key].value = state[key] === null ? '' : String(state[key]).replace('.', separator);
  touched.clear();
}

function formatInputs() {
  const separator = decimalSeparatorFor(lang);
  for (const key of keys) {
    if (state[key] !== null) fields[key].value = String(state[key]).replace('.', separator);
  }
}

function errorVars() {
  return {min: fmt(0.01, 2), max: fmt(MAX_HOURS), unit: t('unit.hours')};
}

function inputError(key, validation) {
  const raw = fields[key].value.trim();
  if (!raw) return t('error.empty');
  if (parseHours(raw) !== null) {
    return validation.errors[key] ? t(`error.${validation.errors[key]}`, errorVars()) : '';
  }
  if (/^-?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(raw)) {
    const number = Number(raw.replace(',', '.'));
    const vars = errorVars();
    if (number < 0.01) return t('error.min', vars);
    if (number > MAX_HOURS) return t('error.max', vars);
    if ((raw.split(/[.,]/)[1] ?? '').length > 2) return t('error.precision');
  }
  return t('error.number');
}

function setMetric(selector, value, sizing = {}) {
  const element = $(selector);
  element.textContent = value?.text ?? '—';
  element.classList.toggle('is-empty', !value);
  element.classList.toggle('is-wide', Boolean(sizing.wide));
  element.classList.toggle('is-long', Boolean(sizing.long));
  element.title = value?.approximate ? t('result.title.rounded') : '';
}

function render() {
  const validation = validateScenarios(state);
  let visibleError = false;
  for (const key of keys) {
    const show = Boolean(validation.errors[key] && (touched.has(key) || fields[key].value.trim() !== ''));
    fields[key].setAttribute('aria-invalid', String(show));
    fields[key].classList.toggle('is-long', fields[key].value.trim().length > 6);
    $(`#${key}-error`).hidden = !show;
    $(`#${key}-error`).textContent = show ? inputError(key, validation) : '';
    visibleError ||= show;
  }
  $('#legacy-note').hidden = !state.legacy;
  if (!validation.valid) {
    setMetric('#sp-value', null);
    setMetric('#hours-value', null);
    $('#result-note').textContent = visibleError ? t('result.note.fix') : t('result.note.empty');
    $('#hours-formula').textContent = t('result.formula.empty');
    $('#sp-formula').textContent = t('result.formula.sp.empty', {rate: HOURS_PER_SP});
    return;
  }
  const result = estimate(state);
  const hours = displayed(result.hours);
  const sp = displayed(result.sp);
  // Keep both metrics at the same size: shrink them together based on the longer value.
  const metricLength = Math.max(hours.text.length, sp.text.length);
  const sizing = {wide: metricLength > 6, long: metricLength > 8};
  setMetric('#sp-value', sp, sizing);
  setMetric('#hours-value', hours, sizing);
  $('#result-note').textContent = hours.approximate || sp.approximate ? t('result.note.rounded') : t('result.note.done');
  $('#hours-formula').textContent = t('result.formula.hours', {
    o: fmt(state.o),
    l: fmt(state.l),
    p: fmt(state.p),
    hours: hours.text,
    unit: t('unit.hours'),
  });
  $('#sp-formula').textContent = t('result.formula.sp', {rate: HOURS_PER_SP, sp: sp.text});
}

function applyLanguage() {
  document.documentElement.lang = lang;
  for (const element of document.querySelectorAll('[data-i18n]')) {
    element.textContent = t(element.getAttribute('data-i18n'));
  }
  for (const element of document.querySelectorAll('[data-i18n-aria-label]')) {
    element.setAttribute('aria-label', t(element.getAttribute('data-i18n-aria-label')));
  }
  for (const element of document.querySelectorAll('[data-i18n-title]')) {
    element.title = t(element.getAttribute('data-i18n-title'));
  }
  document.title = t('page.title');
  $('meta[name="description"]').content = t('page.description');
  const toggle = $('#lang-toggle');
  toggle.textContent = t('lang.button');
  toggle.setAttribute('aria-label', t('lang.aria'));
  toggle.title = t('lang.aria');
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  render();
  if (activeHelp) placeHelp();
}

$('#lang-toggle').addEventListener('click', () => {
  lang = lang === 'ru' ? 'en' : 'ru';
  try { localStorage.setItem('prikidka.lang', lang); } catch {}
  formatInputs();
  applyLanguage();
});

for (const key of keys) {
  fields[key].addEventListener('input', () => {
    state[key] = parseHours(fields[key].value);
    state.legacy = false;
    touched.add(key);
    render();
  });
  fields[key].addEventListener('blur', () => {touched.add(key); render();});
}
$('#reset').addEventListener('click', () => {
  closeHelp();
  state = {...DEFAULTS};
  if (isModelHash(location.hash)) history.replaceState(null, '', location.pathname + location.search);
  syncInputs();
  render();
});
if (location.hash === '#method') $('#pert-method').open = true;
window.addEventListener('hashchange', () => {
  if (location.hash === '#method') $('#pert-method').open = true;
  if (isModelHash(location.hash)) {state = parseState(location.hash); syncInputs(); render();}
});
syncInputs();
applyLanguage();
