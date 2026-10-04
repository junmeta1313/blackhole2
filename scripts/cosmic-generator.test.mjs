import test from 'node:test';
import assert from 'node:assert/strict';
import { options, colorWeights, eligibleE, eligibleF, weightedPick, validateSelection, selectCreativeScene, creativePrompt } from './cosmic-generator.mjs';

test('every subject/framing/distance branch has a compatible mystery and every candidate is reachable', () => {
  const reached = Object.fromEntries([...'ABCDEF'].map(g => [g, new Set()]));
  for (let A = 1; A <= 20; A++) {
    for (const C of options.allowedC[A]) {
      const distances = eligibleE(A, C);
      assert.ok(distances.length, `A${A}/C${C} empty distance intersection`);
      for (const E of distances) {
        const mysteries = eligibleF(A, C, E);
        assert.ok(mysteries.length, `A${A}/C${C}/E${E} dead end`);
        for (let D = 1; D <= 5; D++) {
          for (const B of Object.keys(colorWeights(A, D)).map(Number)) {
            for (const F of mysteries) {
              const selection = { A, B, C, D, E, F };
              assert.equal(validateSelection(selection), true);
              for (const [g, n] of Object.entries(selection)) reached[g].add(n);
            }
          }
        }
      }
    }
  }
  for (const g of 'ABCDEF') assert.equal(reached[g].size, Object.keys(options.groups[g]).length, `unreachable ${g} option`);
});

test('cross-group conflicts are rejected before any image API call', () => {
  assert.deepEqual(eligibleE(4, 10), [2, 6]);
  assert.ok(!options.allowedE[1].includes(3));
  assert.ok(!eligibleF(5, 10, 1).includes(9));
  assert.ok(!eligibleF(1, 10, 1).includes(3));
  assert.ok(!eligibleF(8, 3, 6).includes(5)); // Invalid C/E branch, no background stars.
  assert.throws(() => creativePrompt({ selection: { A: 4, B: 4, C: 10, D: 3, E: 9, F: 9 } }), /Incompatible/);
  assert.throws(() => validateSelection({ A: 21 }), /Invalid A/);
});

test('weighted draws implement exact ticket counts and bounded colorful-tone probabilities', () => {
  const weights = { 1: 15, 2: 25, 3: 30, 4: 20, 5: 10 };
  const counts = {};
  for (let ticket = 0; ticket < 100; ticket++) {
    const n = weightedPick(weights, total => { assert.equal(total, 100); return ticket; });
    counts[n] = (counts[n] || 0) + 1;
  }
  assert.deepEqual(counts, weights);
  assert.deepEqual(colorWeights(1, 3), { 1: 15, 2: 15, 4: 10, 5: 10, 6: 15, 8: 10, 9: 5, 10: 20 });
  for (let A = 1; A <= 20; A++) for (let D = 1; D <= 5; D++) {
    const w = colorWeights(A, D);
    const probability = (w[9] || 0) / Object.values(w).reduce((a, b) => a + b, 0);
    const cap = [1, 2, 3, 12, 18].includes(A) ? .05 : [4, 5].includes(A) ? .10 : .15;
    assert.ok(probability <= cap + 1e-12, `A${A}/D${D} exceeds B9 cap`);
  }
  assert.ok(colorWeights(6, 1)[10] > colorWeights(6, 3)[10]);
  assert.ok(colorWeights(6, 5)[3] > colorWeights(6, 3)[3]);
});

test('random selection order is A/C/E/D/B/F and AI sees only selected detailed conditions', () => {
  const ranges = [];
  const scene = selectCreativeScene([], max => { ranges.push(max); return 0; });
  assert.equal(ranges.length, 6);
  assert.equal(ranges[0], 20);
  assert.equal(ranges[1], options.allowedC[scene.selection.A].length);
  assert.equal(ranges[2], eligibleE(scene.selection.A, scene.selection.C).length);
  assert.equal(ranges[3], 100);
  assert.equal(ranges[4], Object.values(colorWeights(scene.selection.A, scene.selection.D)).reduce((a,b) => a+b,0));
  const prompt = creativePrompt(scene);
  for (const g of 'ABCDEF') {
    const entries = [...prompt.matchAll(new RegExp(`^${g}(\\d+)\\.`, 'gm'))];
    assert.equal(entries.length, 1);
    assert.equal(Number(entries[0][1]), scene.selection[g]);
    assert.ok(prompt.includes(options.groups[g][scene.selection[g]].description));
  }
  assert.match(prompt, /816×816/);
  assert.match(prompt, /인공적 대칭/);
  assert.doesNotMatch(prompt, /A2\.|A20\.|허용 후보/);
});

test('seeded draws exercise history, near/far subjects and all twenty subjects without API calls', () => {
  let state = 123456789;
  const pick = max => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return Math.floor(state / 4294967296 * max); };
  const history = [];
  const subjects = new Set();
  for (let i = 0; i < 2000; i++) {
    const scene = selectCreativeScene(history, pick);
    validateSelection(scene.selection);
    assert.ok(!history.slice(0, 3).some(p => p.generationSelection.A === scene.selection.A));
    subjects.add(scene.selection.A);
    history.unshift({ generationSelection: scene.selection });
  }
  assert.equal(subjects.size, 20);
  const scene = { selection: { A: 2, B: 1, C: 9, D: 1, E: 5, F: 9 } };
  assert.match(creativePrompt(scene), /최소한의 희미한 배경별/);
  assert.match(creativePrompt(scene), /5~15%/);
});
