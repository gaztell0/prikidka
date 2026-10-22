import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS, HOURS_PER_SP, MAX_HOURS, estimate, parseHours, validateScenarios, parseState, serializeState} from './model.js';
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} ≠ ${expected}`);

test('Published PERT weighted mean and 8-hour project conversion', () => {
  const result = estimate({o: 2, l: 4, p: 10});
  near(result.hours, 28 / 6);
  near(result.sp, 7 / 12);
  near(result.sp * HOURS_PER_SP, result.hours);
  // The most likely value has weight four; this is not an unweighted mean.
  assert.notEqual(result.hours, (2 + 4 + 10) / 3);
});

test('Equal scenarios preserve exact fractional SP from the project examples', () => {
  for (const [hours, sp] of [[4, 0.5], [9.6, 1.2], [12, 1.5], [0.01, 0.00125], [MAX_HOURS, MAX_HOURS / 8]]) {
    const result = estimate({o: hours, l: hours, p: hours});
    assert.equal(result.hours, hours);
    assert.equal(result.sp, sp);
  }
});

test('Ordered scenarios have a bounded, monotone mean without intermediate rounding', () => {
  const values = [0.01, 0.1, 0.5, 1, 1.2, 4, 9.6, 12, 100, MAX_HOURS];
  for (const o of values) for (const l of values) for (const p of values) {
    if (o > l || l > p) continue;
    const result = estimate({o, l, p});
    assert.ok(result.hours >= o - 1e-10 && result.hours <= p + 1e-10);
    near(result.sp * 8, result.hours);
    if (l < p) assert.ok(estimate({o, l: p, p}).hours >= result.hours);
  }
  const result = estimate({o: 0.1, l: 0.2, p: 0.4});
  near(result.hours, 1.3 / 6);
  near(result.sp, 1.3 / 48);
});

test('Decimal comma and dot are accepted without exponents, junk, or excessive precision', () => {
  for (const [raw, expected] of [[' 0,5 ', 0.5], ['1.20', 1.2], ['.5', 0.5], [',50', 0.5], ['4,', 4], [9.6, 9.6], ['100000.00', MAX_HOURS]]) assert.equal(parseHours(raw), expected);
  for (const raw of ['', ' ', null, undefined, NaN, Infinity, {}, true, '-1', '0', '+1', '1e2', '1 2', '1.234', '1.200', '1,2.3', '0.001', '100000.01', '<script>']) assert.equal(parseHours(raw), null, String(raw));
});

test('Missing, non-numeric and out-of-order scenarios cannot produce a result', () => {
  assert.equal(validateScenarios(DEFAULTS).valid, false);
  for (const state of [null, {}, DEFAULTS, {o: 0, l: 4, p: 8}, {o: 2, l: NaN, p: 8}, {o: 2, l: 4, p: Infinity}, {o: '2', l: 4, p: 8}, {o: 5, l: 4, p: 8}, {o: 2, l: 9, p: 8}, {o: 5, l: null, p: 4}]) {
    assert.equal(validateScenarios(state).valid, false);
    assert.throws(() => estimate(state), RangeError);
  }
  assert.ok(validateScenarios({o: 5, l: 4, p: 8}).errors.l);
  assert.ok(validateScenarios({o: 2, l: 9, p: 8}).errors.p);
});

test('Old rating links are explicitly retired rather than reinterpreted as hours', () => {
  for (const hash of ['#m=2&v=3&c=2&r=2', '#m=3&v=1&c=1&r=1&sp=1.2']) {
    assert.deepEqual(parseState(hash), {...DEFAULTS, legacy: true});
    assert.throws(() => estimate(parseState(hash)), RangeError);
  }
});

test('New links round-trip scenarios, reject malformed values and cannot change the SP rule', () => {
  const state = {...DEFAULTS, o: 0.5, l: 1.2, p: 4};
  assert.deepEqual(parseState('#' + serializeState(state)), state);
  assert.deepEqual(parseState('#m=4&o=0%2C5&l=1.20&p=4&hoursPerSp=1'), state);
  near(estimate(parseState('#m=4&o=4&l=4&p=4&hoursPerSp=1')).sp, 0.5);
  for (const hash of ['', '#method', '#m=99&o=4', null, '#m=4&o=<script>&l=NaN&p=Infinity']) assert.deepEqual(parseState(hash), DEFAULTS);
  const reversed = parseState('#m=4&o=8&l=4&p=2');
  assert.equal(validateScenarios(reversed).valid, false);
  assert.throws(() => serializeState(DEFAULTS), RangeError);
});
