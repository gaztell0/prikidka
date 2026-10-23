import {DEFAULTS, HOURS_PER_SP, MAX_HOURS, estimate, parseHours, parseState, validateScenarios} from './model.js?v=069f11448740';

const $ = selector => document.querySelector(selector);
const keys = ['o', 'l', 'p'];
const fields = Object.fromEntries(keys.map(key => [key, $(`input[name="${key}"]`)]));
const touched = new Set();
const fmt = (value, digits = 2) => new Intl.NumberFormat('ru-RU', {maximumFractionDigits: digits}).format(value);
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
  $('#theme-label').textContent = dark ? 'Светлая тема' : 'Тёмная тема';
  const action = dark ? 'Включить светлую тему' : 'Включить тёмную тему';
  $('#theme-toggle').setAttribute('aria-label', action);
  $('#theme-toggle').title = action;
  $('#theme-moon').toggleAttribute('hidden', dark);
  $('#theme-sun').toggleAttribute('hidden', !dark);
  $('meta[name="theme-color"]').content = dark ? '#111318' : '#f8fafc';
}
applyTheme(themePreference ?? (themeMedia.matches ? 'dark' : 'light'));
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
  for (const key of keys) fields[key].value = state[key] === null ? '' : String(state[key]).replace('.', ',');
  touched.clear();
}

function inputError(key, validation) {
  const raw = fields[key].value.trim();
  if (!raw) return 'Укажите часы.';
  if (parseHours(raw) !== null) return validation.errors[key] ?? '';
  if (/^-?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(raw)) {
    const number = Number(raw.replace(',', '.'));
    if (number < 0.01) return 'Минимум — 0,01 ч.';
    if (number > MAX_HOURS) return 'Максимум — 100 000 ч.';
    if ((raw.split(/[.,]/)[1] ?? '').length > 2) return 'Оставьте не больше двух знаков после запятой.';
  }
  return 'Введите число, например 1,5 или 1.5.';
}

function setMetric(selector, value) {
  const element = $(selector);
  element.textContent = value?.text ?? '—';
  element.classList.toggle('is-wide', (value?.text.length ?? 0) > 6);
  element.classList.toggle('is-long', (value?.text.length ?? 0) > 8);
  element.title = value?.approximate ? 'Округлено для отображения' : '';
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
    $('#result-note').textContent = visibleError ? 'Исправьте отмеченные поля.' : 'Введите три оценки в часах.';
    $('#hours-formula').textContent = 'Введите три оценки для расчёта.';
    $('#sp-formula').textContent = `Результат PERT / ${HOURS_PER_SP}`;
    return;
  }
  const result = estimate(state);
  const hours = displayed(result.hours);
  const sp = displayed(result.sp);
  setMetric('#sp-value', sp);
  setMetric('#hours-value', hours);
  $('#result-note').textContent = hours.approximate || sp.approximate ? 'Значения округлены для отображения.' : 'Оценка рассчитана.';
  $('#hours-formula').textContent = `(${fmt(state.o)} + 4 × ${fmt(state.l)} + ${fmt(state.p)}) / 6 → ${hours.text} ч`;
  $('#sp-formula').textContent = `((O + 4M + P) / 6) / ${HOURS_PER_SP} → ${sp.text} SP`;
}

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
render();
