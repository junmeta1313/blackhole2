import { estimateCost } from './ai-cost.js';
const WORKER = 'https://quiet-recipe-f7be.kuji5757.workers.dev';

window.showGenerationDetails = function (post) {
  const wrapper = document.getElementById('generation-details');
  const details = wrapper.querySelector('details');
  details.open = false;
  wrapper.hidden = !post;
  const output = document.getElementById('generation-record');
  output.textContent = '';
  if (!post) return;
  const prompt = post.generationPrompt || '기록 없음 — 이 게시물에는 생성 프롬프트가 저장되지 않았습니다.';
  const usageLine = (label, model, usage, storedCost) => {
    if (!usage) return `${label}: 기록 없음`;
    const cost = storedCost || estimateCost(model, usage);
    const suffix = cost ? `약 $${cost.usd.toFixed(6)} (가격 기준 ${cost.pricingDate})` : '비용 계산에 필요한 기록 없음';
    return `${label} (${model || '모델 기록 없음'})\n입력 ${usage.input_tokens?.toLocaleString() ?? '?'} / 출력 ${usage.output_tokens?.toLocaleString() ?? '?'} 토큰\n${suffix}`;
  };
  const imageCost = post.generationCost || estimateCost(post.model, post.generationUsage);
  const storyCost = post.descriptionCost || estimateCost(post.descriptionModel, post.descriptionUsage);
  const total = imageCost && storyCost ? `합계 약 $${(imageCost.usd + storyCost.usd).toFixed(6)}` : '합계: 일부 사용량 기록이 없어 계산할 수 없습니다.';
  output.textContent = [post.sceneKey ? `선택 조합: ${post.sceneKey}` : '', usageLine('이미지 생성', post.model, post.generationUsage, post.generationCost), usageLine('설명글 작성', post.descriptionModel, post.descriptionUsage, post.descriptionCost), total, '달러 금액은 표준 API 가격으로 계산한 추정치이며 실제 청구액과 다를 수 있습니다. 과거 기록을 현재 가격으로 계산한 경우 당시 비용과 다를 수 있습니다.', '이미지 생성 프롬프트', prompt].filter(Boolean).join('\n\n');
};

let sessions = new Map();
let cooldownUntil = 0;
let ready = false;
let busy = false;
let controller;
const articleId = item => String(item.id);
window.addBriefingQuestion = function (article, item) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'text-xs text-purple-200 mt-4 hover:text-white';
  button.textContent = '[질문하기]';
  button.title = '이 브리핑과 원문·웹 자료를 참고하는 AI에게 질문하세요.';
  article.append(button);
  const panel = document.createElement('section');
  panel.hidden = true;
  panel.className = 'mt-4 border-t border-gray-700 pt-4';
  const note = document.createElement('p');
  note.className = 'text-xs text-gray-400 mb-3';
  note.textContent = '원문·웹 검색을 참고하는 AI 답변입니다. 대화는 저장되지 않으며 페이지를 떠나면 사라집니다. 모든 글을 합쳐 같은 IP당 1분에 한 번 질문할 수 있습니다.';
  const log = document.createElement('div');
  log.setAttribute('role', 'log');
  log.setAttribute('aria-live', 'polite');
  log.className = 'space-y-3 max-h-96 overflow-y-auto mb-3';
  const form = document.createElement('form');
  const input = document.createElement('textarea');
  input.maxLength = 1000; input.rows = 2; input.required = true;
  input.placeholder = '이 브리핑에서 궁금한 점을 질문하세요';
  input.setAttribute('aria-label', `${item.title} 질문`);
  input.className = 'w-full bg-zinc-900 text-white border border-gray-600 rounded p-3 text-sm';
  const submit = document.createElement('button');
  submit.type = 'submit'; submit.textContent = '질문 보내기';
  submit.className = 'text-sm rounded bg-purple-900 px-4 py-2 mt-2';
  const status = document.createElement('p');
  status.className = 'text-xs text-gray-400 mt-2'; status.setAttribute('role', 'status');
  form.append(input, submit, status); panel.append(note, log, form); article.append(panel);
  const render = () => {
    log.replaceChildren();
    for (const turn of sessions.get(articleId(item)) || []) {
      const block = document.createElement('div');
      block.className = 'text-sm whitespace-pre-wrap leading-7 rounded bg-zinc-900 p-3';
      const text = document.createElement('p');
      text.textContent = `${turn.role === 'user' ? '질문' : 'AI'}: ${turn.content}`;
      block.append(text);
      for (const source of turn.sources || []) {
        try {
          if (new URL(source.url).protocol !== 'https:') continue;
          const link = document.createElement('a'); link.href = source.url;
          link.target = '_blank'; link.rel = 'noopener noreferrer';
          link.className = 'block text-xs text-purple-200 underline'; link.textContent = source.title;
          block.append(link);
        } catch { /* Ignore invalid source links. */ }
      }
      log.append(block);
    }
    log.scrollTop = log.scrollHeight;
  };
  button.onclick = async () => {
    panel.hidden = !panel.hidden;
    if (panel.hidden) return;
    render(); input.focus();
    if (!ready) {
      status.textContent = '질문 서버 연결을 확인하고 있습니다…';
      try {
        const r = await fetch(`${WORKER}/health`, { signal: AbortSignal.timeout(10000), cache: 'no-store' });
        const health = await r.json(); ready = r.ok && health.ready && health.version === 1;
      } catch { ready = false; }
    }
    submit.disabled = !ready;
    status.textContent = ready ? '' : '질문 서버 설정이 아직 완료되지 않았습니다. 연결 후 이용할 수 있습니다.';
  };
  form.onsubmit = async event => {
    event.preventDefault();
    if (!ready || busy) return;
    const message = input.value.trim(); if (!message) return;
    const seconds = Math.ceil((cooldownUntil - Date.now()) / 1000);
    if (seconds > 0) { status.textContent = `${seconds}초 후 다시 질문해 주세요.`; return; }
    busy = true; submit.disabled = true; status.textContent = '원문과 웹 자료를 확인하고 있습니다…';
    const history = sessions.get(articleId(item)) || [];
    controller = new AbortController();
    try {
      const r = await fetch(`${WORKER}/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ articleId: articleId(item), message, history: history.slice(-6).map(({ role, content }) => ({ role, content })) }) });
      const data = await r.json();
      if (r.status === 429) cooldownUntil = Date.now() + (Number(data.retryAfter) || 60) * 1000;
      if (!r.ok) throw new Error(typeof data.error === 'string' ? data.error : '질문 요청에 실패했습니다.');
      if (typeof data.answer !== 'string') throw new Error('답변 형식이 올바르지 않습니다.');
      const reply = Array.from(data.answer).slice(0, 500).join('');
      history.push({ role: 'user', content: message }, { role: 'assistant', content: reply, sources: data.sources || [] });
      sessions.set(articleId(item), history); cooldownUntil = Date.now() + 60000;
      render(); input.value = ''; status.textContent = '';
    } catch (error) { if (error.name !== 'AbortError') status.textContent = error.message; }
    finally { busy = false; submit.disabled = !ready; }
  };
};
// No localStorage, sessionStorage or server-side chat history. Clear bfcache too.
window.addEventListener('pagehide', () => {
  controller?.abort(); sessions.clear(); ready = false; busy = false;
  document.querySelectorAll('#briefing-list [role="log"]').forEach(log => log.replaceChildren());
  document.querySelectorAll('#briefing-list textarea').forEach(input => { input.value = ''; });
  document.querySelectorAll('#briefing-list article section').forEach(panel => { panel.hidden = true; });
});
