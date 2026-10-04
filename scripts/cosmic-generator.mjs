import fs from 'node:fs';
import { randomInt } from 'node:crypto';

// The runner selects numbers before making any paid API request.
export const options = JSON.parse(fs.readFileSync(new URL('./cosmic-options.json', import.meta.url), 'utf8'));
const numbers = group => Object.keys(options.groups[group]).map(Number);
const intersection = (left, right) => left.filter(value => right.includes(value));

export function weightedPick(weights, pick = randomInt) {
  const entries = Object.entries(weights).map(([key, weight]) => [Number(key), weight]);
  if (!entries.length || entries.some(([, weight]) => !Number.isSafeInteger(weight) || weight <= 0)) throw new Error('Invalid selection weights');
  let ticket = pick(entries.reduce((total, [, weight]) => total + weight, 0));
  for (const [key, weight] of entries) {
    if (ticket < weight) return key;
    ticket -= weight;
  }
  throw new Error('Random source returned an out-of-range ticket');
}

export function colorWeights(a, d) {
  let weights;
  if ([1, 2, 3].includes(a)) weights = { 1: 15, 2: 15, 4: 10, 5: 10, 6: 15, 8: 10, 9: 5, 10: 20 };
  else if ([4, 5].includes(a)) weights = { 2: 15, 4: 20, 5: 15, 6: 10, 7: 15, 8: 10, 9: 10, 10: 5 };
  else if ([15, 16].includes(a)) weights = { 1: 15, 2: 20, 5: 10, 6: 20, 8: 20, 10: 15 };
  else if ([12, 18].includes(a)) weights = { 1: 10, 2: 10, 5: 10, 6: 25, 8: 10, 9: 5, 10: 30 };
  else if (a === 14) weights = { 2: 20, 4: 20, 5: 20, 6: 20, 9: 10 };
  else weights = Object.fromEntries(numbers('B').map(b => [b, 10]));
  // D modifies base weights; B9 remains capped even after normalization.
  const favored = d <= 2 ? [10, 1, 6] : d >= 4 ? [3, 5, 9] : [];
  for (const b of favored) if (weights[b]) weights[b] *= 2;
  const cap = [1, 2, 3, 12, 18].includes(a) ? 5 : [4, 5].includes(a) ? 10 : 15;
  const otherTotal = Object.entries(weights).filter(([b]) => b !== '9').reduce((sum, [, w]) => sum + w, 0);
  if (weights[9] && weights[9] * 100 > cap * (otherTotal + weights[9])) {
    for (const b of Object.keys(weights)) if (b !== '9') weights[b] *= 100 - cap;
    weights[9] = cap * otherTotal;
  }
  return weights;
}

export function eligibleE(a, c) {
  return intersection(options.allowedE[a] || [], options.framingE[c] || []);
}

export function eligibleF(a, c, e) {
  if (!(options.allowedC[a] || []).includes(c) || !eligibleE(a, c).includes(e)) return [];
  return options.allowedF[a].filter(f => {
    // Close surface/detail framing cannot show meaningful background-star evidence.
    if ([1, 5, 9].includes(f) && [1, 6].includes(e)) return false;
    if ([3, 7, 8].includes(f) && e === 1) return false;
    return true;
  });
}

export function validateSelection(selection) {
  for (const group of 'ABCDEF') if (!options.groups[group][selection[group]]) throw new Error(`Invalid ${group} selection`);
  const { A: a, B: b, C: c, D: d, E: e, F: f } = selection;
  if (!options.allowedC[a].includes(c) || !eligibleE(a, c).includes(e) || !eligibleF(a, c, e).includes(f) || !colorWeights(a, d)[b]) throw new Error('Incompatible cosmic selection');
  return true;
}

export function selectCreativeScene(posts = [], pick = randomInt) {
  const recent = posts.slice(0, 3).map(post => post.generationSelection?.A);
  const candidates = numbers('A').filter(a => !recent.includes(a));
  const choose = values => {
    if (!values.length) throw new Error('No compatible cosmic candidates');
    return values[pick(values.length)];
  };
  const A = choose(candidates);
  // Remove dead ends before drawing; no unbounded retries and no paid regeneration.
  const C = choose(options.allowedC[A].filter(c => eligibleE(A, c).some(e => eligibleF(A, c, e).length)));
  const E = choose(eligibleE(A, C).filter(e => eligibleF(A, C, e).length));
  const D = weightedPick({ 1: 15, 2: 25, 3: 30, 4: 20, 5: 10 }, pick);
  const B = weightedPick(colorWeights(A, D), pick);
  const F = choose(eligibleF(A, C, E));
  const selection = { A, B, C, D, E, F };
  validateSelection(selection);
  const key = Object.entries(selection).map(([group, number]) => `${group}${number}`).join('-');
  return { selection, key, category: `A${A}`, title: options.groups.A[A].title };
}

export function creativePrompt(scene) {
  validateSelection(scene.selection);
  const sections = { A: '주된 천문학적 대상 또는 시스템', B: '색상 톤 / 관측 후처리', C: '내부 프레이밍 / 구도', D: '현실성 강도', E: '관측 거리 / 화면 점유율', F: '시각적으로 암시되는 미스터리 요소' };
  const selected = Object.entries(sections).map(([group, label]) => {
    const number = scene.selection[group];
    const item = options.groups[group][number];
    return `${label}:\n${group}${number}. ${item.title}\n${item.description}`;
  }).join('\n\n');
  const { A: a, C: c, E: e, F: f } = scene.selection;
  const notes = [];
  if ([2, 19].includes(a)) notes.push('원거리 대상은 반드시 작게 유지한다. E의 일반적인 점유율보다 A의 5~15% 점유율과 85~95% 심우주 여백 조건을 우선한다.');
  if ([5, 9].includes(f)) notes.push('미스터리를 암시하는 데 필요한 최소한의 희미한 배경별을 허용한다. 배경별은 독립적인 주제가 아니며 심우주 여백을 유지한다.');
  if (f === 1) notes.push('빛의 휨을 드러낼 최소한의 희미한 주변 빛만 둔다.');
  if (f === 3) notes.push(a === 1 ? '고리형 이상은 기존 행성 고리 안에 표현하고 별도의 고리를 추가하지 않는다.' : '고리형 이상은 기존 플라즈마 고리 안에 표현하고 별도의 고리를 추가하지 않는다.');
  if (f === 7) notes.push('미세한 자연적 불규칙성이 있는 반복 구조 단위가 최소 2~3개 보이게 한다.');
  if (f === 8) notes.push('단절 전후의 구조를 모두 프레임 안에 보여준다. 구조가 화면 밖으로 이어져도 단절 자체는 잘리지 않는다.');
  if (a === 8) notes.push('암흑 구조가 주제이며 발광점이 선택되어도 극도로 희미하고 작은 국소점만 허용한다.');
  if ([1, 6].includes(e) || [5, 10].includes(c)) notes.push('선택된 근접/부분 구조 프레이밍을 유지하고 넓은 배경으로 바꾸지 않는다.');
  return `실제로 존재할 법한 가상의 우주 관측 이미지를 생성해줘.\n\n${selected}\n\n${notes.join('\n')}\n\n이 이미지에는 하나의 주된 천문학적 대상 또는 시스템만 존재해야 한다. 쌍성계의 두 별, 성단의 여러 별, 항성 탄생 영역, 잔해의 여러 필라멘트는 하나의 시스템이다. 선택된 A와 직접 관련되지 않은 다른 대형 천체 현상을 추가하지 마. 선택된 A 또는 F가 명시적으로 요구한 구조만 사용하고 다른 행성, 블랙홀, 고리, 은하, 성운을 주요 구조로 추가하지 마. 행성 고리, 블랙홀 강착원반, 독립적인 플라즈마 고리, 기존 구조 안의 고리형 이상은 서로 다른 구조다.\nF는 과학적 증명이나 시간 변화의 기록이 아니라 미묘한 시각적 단서로 표현한다. 주기, 속도 등의 데이터나 글자를 이미지에 표시하지 마. F3/F7의 준규칙성에는 자연적 난류와 불규칙성을 남기고 완벽한 원, 기계적 반복, 인공적 대칭을 피한다.\n실제 우주망원경이 촬영하고 천문학자가 후처리한 관측 이미지처럼 표현한다. 판타지 일러스트, 영화 콘셉트아트, 게임 배경, 인공 구조물처럼 만들지 마. 선택된 D에 맞춰 현실성과 낯섦을 조절하고 B의 색상 계열을 유지한다. 네온, 무지개, 사이키델릭 색감, 과도한 HDR, 불필요한 렌즈 플레어는 금지한다.\n출력은 816×816 정사각형이다. C는 내부 구도만 지시하며 실제 화면비 변경, 검은 레터박스, crop 또는 padding을 요구하지 않는다. 모호한 거리 조건은 A의 의미를 우선한다.\nDo not default to a spiral galaxy, an Andromeda-like scene or a generic colorful nebula. Keep one dominant astronomical subject or system. No text, captions or watermarks.`;
}
