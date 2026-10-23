import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEFAULTS, HOURS_PER_SP, MAX_HOURS, estimate, parseHours, validateScenarios, parseState, serializeState} from './model.js';
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} ≠ ${expected}`);
const keys = ['o', 'l', 'p'];
const pairwiseValues = [0.01, 0.5, 4, 100000];
// Latin-square rows cover every value pair for each pair of fields in 16 cases.
const pairwiseCases = pairwiseValues.flatMap((o, oi) => pairwiseValues.map((l, li) => ({o, l, p: pairwiseValues[(oi + li) % 4]})));

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

test('Additional lexical equivalence classes are handled explicitly', () => {
  for (const [raw, expected] of [['\t4.50\n', 4.5], ['0004.50', 4.5], ['000000,01', 0.01], ['4.', 4], ['100000,00', MAX_HOURS]]) assert.equal(parseHours(raw), expected);
  const rejectedClasses = {
    unsupportedTypes: [false, [], [4], () => 4, 4n],
    signedOrNonFinite: ['-0', '−1', '-Infinity', 'NaN', 'Infinity', -Infinity],
    otherNumericNotation: ['1E+2', '0x10', '0b10', '1_000', '1/2'],
    groupingOrSeparators: ['1 000', '1\u00a0000', '1.2,3', '.', ',', '1..2'],
    textAndOtherDigits: ['4 часа', '<script>alert(1)</script>', '١', '４'],
  };
  for (const [group, values] of Object.entries(rejectedClasses)) for (const raw of values) assert.equal(parseHours(raw), null, `${group}: ${String(raw)}`);
});

test('Inclusive range bounds and adjacent 0.01 steps apply to every field', () => {
  for (const [value, accepted] of [[0, false], [0.01, true], [0.02, true], [99999.99, true], [100000, true], [100000.01, false]]) {
    assert.equal(parseHours(value), accepted ? value : null, `boundary ${value}`);
    for (const key of keys) {
      // Keep the other fields ordered to isolate this field's numeric boundary.
      const state = {o: 0.01, l: key === 'o' ? 100000 : 0.01, p: 100000, [key]: value};
      const result = validateScenarios(state);
      assert.equal(result.valid, accepted, `${key}: ${value}`);
      if (!accepted) {
        assert.ok(result.errors[key]);
        assert.throws(() => estimate(state), RangeError);
      }
    }
  }
});

test('Each field rejects invalid model values and excessive precision before calculation', () => {
  for (const key of keys) for (const invalid of [undefined, null, '', '4', 0, -1, NaN, Infinity, 1.234, 100000.01]) {
    const state = {o: 0.01, l: 4, p: 100000, [key]: invalid};
    assert.equal(validateScenarios(state).valid, false, `${key}: ${String(invalid)}`);
    assert.ok(validateScenarios(state).errors[key]);
    assert.throws(() => estimate(state), RangeError);
    assert.throws(() => serializeState(state), RangeError);
  }
  for (const raw of ['0.009', '99999.999', '100000.001']) assert.equal(parseHours(raw), null);
  const precise = estimate({o: 0.01, l: 0.02, p: 0.03});
  assert.equal(precise.hours, 0.02);
  assert.equal(precise.sp, 0.0025);
});

test('All strict order permutations, allowed equalities and field error locations', () => {
  const cases = [
    [{o: 1, l: 2, p: 3}, []], [{o: 1, l: 3, p: 2}, ['p']],
    [{o: 2, l: 1, p: 3}, ['l']], [{o: 2, l: 3, p: 1}, ['p']],
    [{o: 3, l: 1, p: 2}, ['l', 'p']], [{o: 3, l: 2, p: 1}, ['l', 'p']],
    [{o: 2, l: 2, p: 3}, []], [{o: 1, l: 2, p: 2}, []], [{o: 2, l: 2, p: 2}, []],
    [{o: 2, l: 1, p: 1}, ['l', 'p']], [{o: 3, l: null, p: 2}, ['l', 'p']],
  ];
  for (const [state, errors] of cases) {
    const validation = validateScenarios(state);
    assert.deepEqual(Object.keys(validation.errors).sort(), errors);
    assert.equal(validation.valid, errors.length === 0);
    if (errors.length) assert.throws(() => estimate(state), RangeError);
  }
});

test('16 pairwise rows cover all 48 pairs and include valid and invalid orders', () => {
  assert.equal(pairwiseCases.length, 16);
  assert.equal(new Set(pairwiseCases.map(row => JSON.stringify(row))).size, 16);
  for (const [a, b] of [['o', 'l'], ['o', 'p'], ['l', 'p']]) {
    const covered = new Set(pairwiseCases.map(row => `${row[a]}|${row[b]}`));
    assert.equal(covered.size, 16, `${a}/${b}`);
    for (const av of pairwiseValues) for (const bv of pairwiseValues) assert.ok(covered.has(`${av}|${bv}`));
  }
  let valid = 0;
  let invalid = 0;
  for (const state of pairwiseCases) {
    const expectedValid = state.o <= state.l && state.l <= state.p;
    assert.equal(validateScenarios(state).valid, expectedValid, JSON.stringify(state));
    if (!expectedValid) {invalid++; assert.throws(() => estimate(state), RangeError); continue;}
    valid++;
    const result = estimate(state);
    near(result.hours, (state.o + 4 * state.l + state.p) / 6);
    near(result.sp, result.hours / 8);
    assert.ok(result.hours >= state.o && result.hours <= state.p);
  }
  assert.ok(valid > 0 && invalid > 0);
});

test('URL roundtrip preserves valid pairwise cases and decimal precision', () => {
  const rows = [...pairwiseCases.filter(({o, l, p}) => o <= l && l <= p), {o: 0.01, l: 1.23, p: 99999.99}, {o: 9.6, l: 9.6, p: 12}];
  for (const row of rows) {
    const state = {...DEFAULTS, ...row};
    assert.deepEqual(parseState('#' + serializeState(state)), state);
    assert.deepEqual(parseState(serializeState(state)), state);
  }
});

test('URL field values cannot bypass lexical validation or ordering', () => {
  for (const key of keys) for (const raw of ['', '0', '-1', '1e2', '1.234', '100000.01', 'abc']) {
    const params = new URLSearchParams({m: '4', o: '0.01', l: '4', p: '100000', [key]: raw});
    const state = parseState('#' + params);
    assert.equal(state[key], null);
    assert.equal(validateScenarios(state).valid, false);
    assert.throws(() => serializeState(state), RangeError);
  }
});

test('Documented UI matrix expectations match model behavior; UI execution is separate', () => {
  const matrix = JSON.parse(readFileSync(new URL('./qa-matrix.json', import.meta.url), 'utf8'));
  assert.equal(matrix.pairwiseCases.length, 16);
  for (const row of [...matrix.pairwiseCases, ...matrix.equivalenceCases]) {
    const state = Object.fromEntries(keys.map(key => [key, parseHours(row.inputs[key])]));
    const validation = validateScenarios(state);
    assert.equal(validation.valid, row.expected.valid, row.id);
    assert.deepEqual(Object.keys(validation.errors).sort(), row.expected.errorFields, row.id);
    if (row.expected.valid) {
      near(estimate(state).hours, row.expected.hours);
      near(estimate(state).sp, row.expected.sp);
    } else assert.throws(() => estimate(state), RangeError);
  }
});
