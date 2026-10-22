import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS, FIBONACCI, VOLUME, estimate, parsePoints, parseState, serializeState} from './model.js';

test('Automatic estimates start below 1 SP and round upward to tenths', () => {
  assert.deepEqual(VOLUME, [0.5, 1, 2, 4, 8]);
  assert.deepEqual([estimate({...DEFAULTS, v: 1, c: 1, r: 1}).sp, estimate(DEFAULTS).sp, estimate({...DEFAULTS, v: 5, c: 5, r: 5}).sp], [0.5, 2.8, 48]);
  assert.equal(estimate(DEFAULTS).hours, 22.4);
  assert.equal(estimate(DEFAULTS).manual, false);
  assert.equal(estimate(DEFAULTS).legacy, false);
});

test('All 125 automatic combinations are monotone and follow 8 person-hours per SP', () => {
  for (let v = 1; v <= 5; v++) for (let c = 1; c <= 5; c++) for (let r = 1; r <= 5; r++) {
    const state = {...DEFAULTS, v, c, r};
    const result = estimate(state);
    assert.ok(result.sp >= result.score - 1e-12);
    assert.ok(result.sp - result.score < 0.1 + 1e-12);
    assert.equal(result.sp, result.suggestedSp);
    assert.equal(Math.round(result.sp * 10), result.sp * 10);
    assert.equal(result.hours, Math.round(result.sp * 800) / 100);
    for (const key of ['v', 'c', 'r']) if (state[key] < 5) {
      const next = estimate({...state, [key]: state[key] + 1});
      assert.ok(next.sp >= result.sp);
      assert.ok(next.hours >= result.hours);
    }
  }
});

test('Exact tenth boundaries do not gain an extra tenth', () => {
  assert.equal(estimate({...DEFAULTS, v: 2, c: 1, r: 2}).sp, 1.1);
  assert.equal(estimate({...DEFAULTS, v: 1, c: 4, r: 2}).sp, 1.1);
  assert.equal(estimate({...DEFAULTS, v: 3, c: 4, r: 2}).sp, 4.4);
  assert.equal(estimate({...DEFAULTS, v: 1, c: 2, r: 1}).sp, 0.7);
});

test('Manual decimal SP convert exactly, retaining the suggested estimate', () => {
  for (const [sp, hours] of [[0.5, 4], [1.2, 9.6], [1.5, 12], [0.01, 0.08], [1.23, 9.84], [1000, 8000]]) {
    const result = estimate({...DEFAULTS, sp});
    assert.equal(result.sp, sp);
    assert.equal(result.hours, hours);
    assert.equal(result.suggestedSp, 2.8);
    assert.equal(result.manual, true);
  }
});

test('Point input accepts comma, dot and surrounding whitespace, and rejects malformed values', () => {
  for (const [raw, points] of [[' 0,5 ', 0.5], ['1.20', 1.2], ['.5', 0.5], [',50', 0.5], ['1000.00', 1000], [1.5, 1.5]]) assert.equal(parsePoints(raw), points);
  for (const raw of ['', ' ', '0', '0.00', '-1', '+1', '1e2', '1.234', '1.200', '1,2.3', '1 2', '1.', '1foo', 'NaN', 'Infinity', '1000.01', '0.001', NaN, Infinity, null, undefined, {}, true]) {
    assert.equal(parsePoints(raw), null, String(raw));
  }
});

test('Invalid levels, methods and manual SP are rejected; warnings reflect the effective estimate', () => {
  for (const v of [NaN, Infinity, 0, -1, 6, 1.5, '3']) assert.throws(() => estimate({...DEFAULTS, v}), RangeError);
  for (const sp of [NaN, Infinity, 0, -1, 0.001, 1.234, 1000.01, '1.2', {}, true]) assert.throws(() => estimate({...DEFAULTS, sp}), RangeError);
  assert.throws(() => estimate({...DEFAULTS, m: 99}), RangeError);
  assert.equal(estimate(DEFAULTS).split, false);
  assert.equal(estimate({...DEFAULTS, r: 4}).investigate, true);
  assert.equal(estimate({...DEFAULTS, sp: 13}).split, true);
  assert.equal(estimate({...DEFAULTS, v: 5, c: 5, r: 5, sp: 0.5}).split, false);
});

test('All 125 legacy combinations retain upward Fibonacci results and 8-hour conversion', () => {
  const oldVolume = [1, 2, 3, 5, 8];
  const complexity = [1, 1.25, 1.5, 2, 3];
  const risk = [1, 1.1, 1.25, 1.5, 2];
  for (let v = 1; v <= 5; v++) for (let c = 1; c <= 5; c++) for (let r = 1; r <= 5; r++) {
    const result = estimate(parseState(`#m=2&v=${v}&c=${c}&r=${r}`));
    const expected = FIBONACCI.find(point => point >= oldVolume[v - 1] * complexity[c - 1] * risk[r - 1] - 1e-9);
    assert.equal(result.sp, expected);
    assert.equal(result.hours, expected * 8);
    assert.equal(result.legacy, true);
    assert.equal(result.manual, false);
  }
  const legacy = parseState('#m=2&v=3&c=2&r=2&sp=0.5');
  assert.equal(estimate(legacy).sp, 5);
  assert.equal(estimate(legacy).hours, 40);
  assert.equal(legacy.sp, null);
});

test('Old and new share links round trip and normalize decimal separators', () => {
  for (const state of [{...DEFAULTS}, {...DEFAULTS, v: 5, c: 1, r: 4, sp: 1.2}, {...DEFAULTS, m: 2, v: 3, c: 2, r: 2}]) {
    assert.deepEqual(parseState('#' + serializeState(state)), state);
  }
  const comma = parseState('#m=3&v=1&c=1&r=1&sp=1%2C20');
  assert.equal(comma.sp, 1.2);
  assert.equal(serializeState(comma), 'm=3&v=1&c=1&r=1&sp=1.2');
  assert.equal(serializeState({...DEFAULTS, sp: 0.01}), 'm=3&v=3&c=2&r=2&sp=0.01');
});

test('Malformed share parameters fall back safely and cannot override hours per SP', () => {
  for (const hash of ['#m=99&v=5', '#method', '', null, undefined]) assert.deepEqual(parseState(hash), DEFAULTS);
  assert.deepEqual(parseState('#m=3&v=<script>&c=-1&r=Infinity&sp=junk'), DEFAULTS);
  assert.deepEqual(parseState('#m=3&v=0x5&c=5.0&r=1e0&sp=0'), DEFAULTS);
  for (const sp of ['0', 'NaN', 'Infinity', '1e2', '1.234', '1000.01']) assert.equal(parseState('#m=3&sp=' + sp).sp, null);
  assert.equal(estimate(parseState('#m=3&sp=1.2&p=1&h=4&hoursPerSp=1')).hours, 9.6);
  assert.equal(estimate(parseState('#m=2&v=3&c=2&r=2&p=1&h=4')).hours, 40);
  assert.equal(serializeState({...DEFAULTS, hoursPerSp: 1}), 'm=3&v=3&c=2&r=2');
});
