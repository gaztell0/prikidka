// Three-point PERT effort estimate, as described by PMI:
// https://www.pmi.org/learning/library/leveraging-new-practice-standard-project-estimating-6222
// The conversion to SP is this project's convention, not part of PERT.
export const HOURS_PER_SP = 8;
export const MAX_HOURS = 100000;
export const DEFAULTS = Object.freeze({m: 4, o: null, l: null, p: null, legacy: false});
export const PERT_WEIGHTS = Object.freeze({optimistic: 1, likely: 4, pessimistic: 1});
const keys = ['o', 'l', 'p'];

export function parseHours(raw) {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const text = String(raw).trim();
  if (!/^(?:\d+(?:[.,]\d{0,2})?|[.,]\d{1,2})$/.test(text)) return null;
  const value = Number(text.replace(',', '.'));
  return Number.isFinite(value) && value >= 0.01 && value <= MAX_HOURS ? value : null;
}

function isHours(value) {
  return typeof value === 'number' && parseHours(value) === value;
}

export function validateScenarios(state) {
  const errors = {};
  for (const key of keys) {
    if (!isHours(state?.[key])) errors[key] = 'Укажите от 0,01 до 100 000 часов, до двух знаков после запятой.';
  }
  if (!errors.o && !errors.l && state.o > state.l) {
    errors.l = 'Наиболее вероятная оценка должна быть не меньше оптимистичной.';
  }
  if (isHours(state?.l) && !errors.p && state.l > state.p) {
    errors.p = 'Пессимистичная оценка должна быть не меньше наиболее вероятной.';
  } else if (isHours(state?.o) && !errors.p && state.o > state.p) {
    errors.p = 'Пессимистичная оценка должна быть не меньше оптимистичной.';
  }
  return {valid: Object.keys(errors).length === 0, errors};
}

export function estimate(state) {
  const validation = validateScenarios(state);
  if (!validation.valid) throw new RangeError(Object.values(validation.errors).join(' '));
  // Inputs have at most two decimals. Weighted cents avoid introducing extra
  // input rounding; do not round the PERT result before converting to SP.
  const weightedCents = Math.round(state.o * 100)
    + PERT_WEIGHTS.likely * Math.round(state.l * 100)
    + Math.round(state.p * 100);
  return {
    hours: weightedCents / 600,
    sp: weightedCents / (600 * HOURS_PER_SP),
    optimistic: state.o,
    likely: state.l,
    pessimistic: state.p,
  };
}

export function parseState(hash) {
  const state = {...DEFAULTS};
  if (typeof hash !== 'string') return state;
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const method = params.get('m');
  if (method === '2' || method === '3') return {...state, legacy: true};
  if (method !== '4') return state;
  for (const key of keys) state[key] = parseHours(params.get(key));
  return state;
}

export function serializeState(state) {
  estimate(state);
  return new URLSearchParams({m: 4, o: state.o, l: state.l, p: state.p}).toString();
}
