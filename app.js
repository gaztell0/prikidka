import {DEFAULTS, VOLUME, COMPLEXITY, RISK, HOURS_PER_SP, estimate, parsePoints, parseState} from './model.js';

const hints = {
  v: ['Одно точечное изменение: текст, настройка или небольшая правка.', 'Небольшая самостоятельная доработка с понятными границами.', 'Несколько связанных изменений в одном сценарии.', 'Несколько сценариев или компонентов, заметный объём проверки.', 'Крупная функциональность, затрагивающая много частей продукта.'],
  c: ['Готовый шаблон или знакомое решение, почти без новой логики.', 'Подход понятен, потребуется немного адаптации.', 'Новая логика или интеграция, несколько технических нюансов.', 'Сложные взаимосвязи, архитектурные решения или много ограничений.', 'Новый для команды подход со сложной технической реализацией.'],
  r: ['Требования ясны, зависимости проверены, сюрпризы маловероятны.', 'Есть небольшие вопросы, существенных препятствий не ожидается.', 'Есть неизвестные или внешние зависимости, возможна переделка.', 'Важные предположения не проверены, сначала нужно исследование.', 'Ключевые требования или возможность реализации пока не ясны.'],
};
const $ = selector => document.querySelector(selector);
const legacyVolume = [1, 2, 3, 5, 8];
const fmt = (value, digits = 2) => new Intl.NumberFormat('ru-RU', {maximumFractionDigits: digits}).format(value);
const inputPoints = value => String(value).replace('.', ',');
let state = parseState(location.hash);
let manualInvalid = false;

function syncInputs() {
  for (const key of ['v', 'c', 'r']) $(`input[name="${key}"][value="${state[key]}"]`).checked = true;
  $('#manual-sp').value = state.sp === null ? '' : inputPoints(state.sp);
  $('#manual-points').open = state.sp !== null;
}

function render() {
  const result = estimate(state);
  const volume = result.legacy ? legacyVolume : VOLUME;
  for (const key of ['v', 'c', 'r']) $(`#${key}-hint`).textContent = hints[key][state[key] - 1];
  $('#sp-value').textContent = manualInvalid ? '—' : fmt(result.sp);
  $('.points').classList.toggle('is-wide', result.sp >= 100);
  $('#hours-value').textContent = manualInvalid ? '—' : fmt(result.hours);
  $('#result-caption').textContent = manualInvalid ? 'Укажите корректные SP' : result.manual ? 'Итог уточнён вручную' : result.legacy ? 'Старая шкала · Фибоначчи' : 'Расчёт по трём параметрам · шаг 0,1 SP';
  $('#result-note').textContent = manualInvalid ? 'Введите число в поле ниже или вернитесь к расчёту по параметрам.' : `${fmt(result.sp)} SP × ${HOURS_PER_SP} = ${fmt(result.hours)} чел.-ч. Пересчёт по правилу проекта, не календарный срок.`;
  $('#manual-sp').setAttribute('aria-invalid', String(manualInvalid));
  $('#points-error').hidden = !manualInvalid;
  $('#use-calculated').hidden = !manualInvalid && !result.manual;
  $('#legacy-note').hidden = !result.legacy;
  $('#points-hint').textContent = `Расчёт по параметрам: ${fmt(result.suggestedSp)} SP. Ручное значение заменяет его целиком — учтите все работы и риски.`;
  for (const button of document.querySelectorAll('[data-points]')) button.setAttribute('aria-pressed', String(result.manual && !manualInvalid && result.sp === Number(button.dataset.points)));
  const messages = [];
  if (!manualInvalid && result.split) messages.push('13 SP и выше — повод разделить задачу и оценить части отдельно.');
  if (result.investigate) messages.push('При высоком риске сначала проведите короткое исследование и уточните оценку.');
  $('#advice').hidden = !messages.length;
  $('#advice').textContent = messages.join(' ');
  $('#sp-method-description').textContent = result.legacy ? 'Открыта старая ссылка: прежняя база объёма и округление вверх по Фибоначчи. Измените параметры, чтобы включить дробные SP.' : 'Объём задаёт базу, сложность и риски увеличивают её. Результат округляется вверх с шагом 0,1 SP. Итог можно уточнить вручную.';
  for (const cell of document.querySelectorAll('[data-volume]')) cell.textContent = fmt(volume[Number(cell.dataset.volume)]);
  $('#formula').replaceChildren(document.createTextNode(`${fmt(volume[state.v - 1])} × ${fmt(COMPLEXITY[state.c - 1])} × ${fmt(RISK[state.r - 1])} = ${fmt(result.score, 4)} → `));
  const spStrong = document.createElement('strong');
  spStrong.textContent = `${fmt(result.suggestedSp)} SP`;
  $('#formula').append(spStrong);
  $('#hours-formula').replaceChildren();
  if (manualInvalid) {$('#hours-formula').textContent = 'Введите корректные итоговые SP.'; return;}
  $('#hours-formula').append(document.createTextNode(`${fmt(result.sp)} SP × ${HOURS_PER_SP} ч/SP = `));
  const hoursStrong = document.createElement('strong');
  hoursStrong.textContent = `${fmt(result.hours)} ч`;
  $('#hours-formula').append(hoursStrong);
  if (result.manual) $('#hours-formula').append(document.createTextNode(' · SP уточнены вручную'));
}

function setManual(value) {
  state.m = 3;
  state.sp = value;
  manualInvalid = false;
  $('#manual-sp').value = value === null ? '' : inputPoints(value);
  render();
}

for (const key of ['v', 'c', 'r']) {
  for (const input of document.querySelectorAll(`input[name="${key}"]`)) {
    input.addEventListener('change', () => {state[key] = Number(input.value); setManual(null);});
    input.setAttribute('aria-describedby', `${key}-hint`);
  }
}
$('#manual-sp').addEventListener('input', event => {
  state.m = 3;
  const raw = event.target.value.trim();
  const points = parsePoints(raw);
  manualInvalid = raw !== '' && points === null;
  if (!manualInvalid) state.sp = points;
  render();
});
for (const button of document.querySelectorAll('[data-points]')) button.addEventListener('click', () => setManual(Number(button.dataset.points)));
$('#use-calculated').addEventListener('click', () => setManual(null));
$('.header nav a').addEventListener('click', event => {event.preventDefault(); $('#method').scrollIntoView({behavior: 'smooth'});});
$('#reset').addEventListener('click', () => {
  state = {...DEFAULTS};
  manualInvalid = false;
  if (location.hash.startsWith('#m=')) history.replaceState(null, '', location.pathname + location.search);
  syncInputs();
  render();
});
window.addEventListener('hashchange', () => {
  if (location.hash.startsWith('#m=')) {state = parseState(location.hash); manualInvalid = false; syncInputs(); render();}
});
syncInputs();
render();
