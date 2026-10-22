import {DEFAULTS, HOURS_PER_SP, estimate, parseHours, parseState, validateScenarios} from './model.js?v=069f11448740';

const $ = selector => document.querySelector(selector);
const keys = ['o', 'l', 'p'];
const fields = Object.fromEntries(keys.map(key => [key, $(`input[name="${key}"]`)]));
const touched = new Set();
const fmt = (value, digits = 2) => new Intl.NumberFormat('ru-RU', {maximumFractionDigits: digits}).format(value);
let state = parseState(location.hash);

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
  $('meta[name="theme-color"]').content = dark ? '#101625' : '#f7f8fa';
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

function displayed(value) {
  // Preserve small positive estimates rather than displaying zero SP.
  const digits = value < 0.01 ? 6 : 2;
  const rounded = Math.round(value * 10 ** digits) / 10 ** digits;
  const approximate = Math.abs(value - rounded) > Number.EPSILON * Math.max(1, value) * 4;
  return {text: `${approximate ? '≈ ' : ''}${fmt(value, digits)}`, approximate};
}

function syncInputs() {
  for (const key of keys) fields[key].value = state[key] === null ? '' : String(state[key]).replace('.', ',');
  touched.clear();
}

function render() {
  const {valid, errors} = validateScenarios(state);
  let visibleError = false;
  for (const key of keys) {
    const show = Boolean(errors[key] && (touched.has(key) || fields[key].value.trim() !== ''));
    fields[key].setAttribute('aria-invalid', String(show));
    $(`#${key}-error`).hidden = !show;
    $(`#${key}-error`).textContent = show ? errors[key] : '';
    visibleError ||= show;
  }
  $('#legacy-note').hidden = !state.legacy;
  $('#scenario-range').hidden = !valid;
  if (!valid) {
    $('#sp-value').textContent = '—';
    $('#hours-value').textContent = '—';
    $('.points').classList.remove('is-wide');
    $('#result-caption').textContent = visibleError ? 'Проверьте значения сценариев' : 'Заполните три сценария';
    $('#result-note').textContent = 'Результат появится после ввода трёх корректных оценок.';
    $('#hours-formula').textContent = 'Введите O, M и P для расчёта';
    $('#sp-formula').textContent = `Результат PERT / ${HOURS_PER_SP}`;
    return;
  }
  const result = estimate(state);
  const hours = displayed(result.hours);
  const sp = displayed(result.sp);
  $('#sp-value').textContent = sp.text;
  $('#hours-value').textContent = hours.text;
  $('.points').classList.toggle('is-wide', sp.text.length > 6);
  $('#result-caption').textContent = 'Пересчёт ожидаемых трудозатрат в SP';
  $('#range-value').textContent = `${fmt(result.optimistic)} — ${fmt(result.pessimistic)} чел.-ч`;
  $('#result-note').textContent = hours.approximate || sp.approximate
    ? '≈ — округление для отображения. Расчёт и перевод в SP выполнены без промежуточного округления.'
    : 'Результат рассчитан по трём сценариям. Границы O — P не являются доверительным интервалом.';
  $('#hours-formula').textContent = `(${fmt(state.o)} + 4 × ${fmt(state.l)} + ${fmt(state.p)}) / 6 → ${hours.text} чел.-ч`;
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
$('#load-example').addEventListener('click', () => {
  state = {...DEFAULTS, o: 2, l: 4, p: 10};
  syncInputs();
  render();
});
$('#reset').addEventListener('click', () => {
  state = {...DEFAULTS};
  if (location.hash.startsWith('#m=')) history.replaceState(null, '', location.pathname + location.search);
  syncInputs();
  render();
});
$('.header nav a[href="#method"]').addEventListener('click', () => {$('#pert-method').open = true;});
if (location.hash === '#method') $('#pert-method').open = true;
window.addEventListener('hashchange', () => {
  if (location.hash === '#method') $('#pert-method').open = true;
  if (location.hash.startsWith('#m=')) {state = parseState(location.hash); syncInputs(); render();}
});
syncInputs();
render();
