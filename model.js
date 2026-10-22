export const FIBONACCI = Object.freeze([1, 2, 3, 5, 8, 13, 21, 34, 55]);
export const VOLUME = Object.freeze([0.5, 1, 2, 4, 8]);
export const COMPLEXITY = Object.freeze([1, 1.25, 1.5, 2, 3]);
export const RISK = Object.freeze([1, 1.1, 1.25, 1.5, 2]);
export const HOURS_PER_SP = 8;
export const DEFAULTS = Object.freeze({m: 3, v: 3, c: 2, r: 2, sp: null});

const LEGACY_VOLUME = Object.freeze([1, 2, 3, 5, 8]);

function level(value) {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}

export function parsePoints(raw) {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const value = String(raw).trim();
  if (!/^(?:\d+(?:[.,]\d{1,2})?|[.,]\d{1,2})$/.test(value)) return null;
  const points = Number(value.replace(',', '.'));
  return Number.isFinite(points) && points >= 0.01 && points <= 1000 ? points : null;
}

export function estimate(state) {
  if (!state || ![state.v, state.c, state.r].every(level)) {
    throw new RangeError('Оценки должны быть целыми числами от 1 до 5');
  }
  const method = state.m ?? 3;
  if (method !== 2 && method !== 3) throw new RangeError('Неизвестная версия расчёта');
  const legacy = method === 2;
  const manual = state.sp !== null && state.sp !== undefined;
  if (manual && (legacy || typeof state.sp !== 'number' || parsePoints(state.sp) === null)) {
    throw new RangeError('SP должны быть числом от 0,01 до 1000, не более двух знаков после запятой');
  }

  const volume = (legacy ? LEGACY_VOLUME : VOLUME)[state.v - 1];
  // Integer arithmetic keeps an exact tenth from gaining an extra tenth due
  // to floating-point rounding. All coefficients have at most two decimals.
  const numerator = volume * 2 * Math.round(COMPLEXITY[state.c - 1] * 100) * Math.round(RISK[state.r - 1] * 100);
  const score = numerator / 20000;
  const suggestedSp = legacy
    ? FIBONACCI.find(point => point >= score - 1e-9)
    : Math.ceil(numerator / 2000) / 10;
  if (suggestedSp === undefined) throw new RangeError('Оценка выходит за шкалу');
  const sp = manual ? state.sp : suggestedSp;
  return {
    score, suggestedSp, sp,
    hours: Math.round(sp * HOURS_PER_SP * 100) / 100,
    manual, legacy,
    split: sp >= 13,
    investigate: state.r >= 4,
  };
}

export function parseState(hash) {
  const state = {...DEFAULTS};
  if (typeof hash !== 'string') return state;
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const method = params.get('m');
  if (method !== '2' && method !== '3') return state;
  state.m = Number(method);
  for (const key of ['v', 'c', 'r']) {
    const raw = params.get(key);
    if (/^[1-5]$/.test(raw ?? '')) state[key] = Number(raw);
  }
  if (state.m === 3) state.sp = parsePoints(params.get('sp'));
  return state;
}

export function serializeState(state) {
  estimate(state);
  const params = new URLSearchParams({m: state.m ?? 3, v: state.v, c: state.c, r: state.r});
  if (state.sp !== null && state.sp !== undefined) params.set('sp', String(state.sp));
  return params.toString();
}
