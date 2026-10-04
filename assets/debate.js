(() => {
  const API = 'https://quiet-recipe-f7be.kuji5757.workers.dev';
  let active = null, running = false;
  const el = id => document.getElementById(id);
  async function request(path, body) {
    const response = await fetch(API + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(80000) } : { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : '서버 연결을 확인해주세요.');
    return data;
  }
  function setStatus(text) { el('debate-status').textContent = text; }
  function renderTurns(turns) {
    const chat = el('debate-chat'); chat.replaceChildren();
    for (const [i, turn] of turns.entries()) {
      const bubble = document.createElement('article');
      bubble.className = 'debate-bubble ' + (turn.speaker === 'openai' ? 'debate-openai' : 'debate-gemini');
      const name = document.createElement('strong'); name.textContent = `${i + 1}. ${turn.speaker === 'openai' ? 'ChatGPT' : 'Gemini'}`;
      const text = document.createElement('p'); text.textContent = turn.text;
      bubble.append(name, text); chat.append(bubble);
    }
    chat.scrollTop = chat.scrollHeight;
  }
  function renderSummary(summary) {
    const box = el('debate-summary'); box.replaceChildren(); box.hidden = !summary;
    if (!summary) return;
    for (const [key, label] of [['openai', 'ChatGPT 측 주장 요약'], ['gemini', 'Gemini 측 주장 요약']]) {
      const heading = document.createElement('h4'); heading.textContent = label;
      const text = document.createElement('p'); text.textContent = summary[key];
      box.append(heading, text);
    }
  }
  async function loadList() {
    const list = el('debate-posts'); list.replaceChildren();
    try {
      const data = await request('/debates');
      if (!data.debates.length) { list.textContent = '완료된 토론이 아직 없습니다.'; return; }
      for (const record of data.debates) {
        const button = document.createElement('button'); button.type = 'button';
        button.className = 'debate-post';
        button.textContent = `${record.topic} · ${record.totalTurns}회 · ${new Date(record.createdAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`;
        button.onclick = async () => {
          if (running || active) { setStatus('진행 중인 토론을 완료한 뒤 다른 기록을 열어주세요.'); return; }
          try {
            const { debate } = await request(`/debates/${record.id}`);
            el('debate-view-title').textContent = debate.topic;
            el('debate-positions').textContent = `ChatGPT: ${debate.openaiPosition}\nGemini: ${debate.geminiPosition}`;
            renderTurns(debate.turns); renderSummary(debate.summary); setStatus('저장된 토론 기록입니다.');
          } catch (error) { setStatus(error.message); }
        };
        list.append(button);
      }
    } catch { list.textContent = '토론 서버 설정 후 게시글 목록이 표시됩니다.'; }
  }
  async function advance() {
    if (!active || running) return;
    running = true; el('debate-fields').disabled = true; el('debate-resume').hidden = true;
    try {
      while (active) {
        const summarizing = active.turns.length >= active.totalTurns;
        const speaker = active.turns.length % 2 === 0 ? 'ChatGPT' : 'Gemini';
        setStatus(summarizing ? 'Gemini가 양측 주장 요약을 정리하고 있습니다…' : `${speaker} · 반박 준비중.... (${active.turns.length + 1}/${active.totalTurns})`);
        const data = await request(`/debates/${active.id}/turn`, { token: active.token, expectedTurn: active.turns.length });
        if (data.completed) {
          renderTurns(data.debate.turns); renderSummary(data.debate.summary);
          active = null; setStatus('토론이 완료되어 게시글로 저장됐습니다.'); await loadList(); break;
        }
        if (data.synced) active.turns = data.debate.turns;
        else active.turns.push(data.turn);
        renderTurns(active.turns);
      }
    } catch (error) {
      setStatus(`${error.message} 기존 발언은 유지됩니다. 계속하기를 누르면 추가 API 비용이 발생할 수 있습니다.`);
      el('debate-resume').hidden = !active;
    } finally { running = false; el('debate-fields').disabled = !!active; }
  }
  window.loadDebateBoard = loadList;
  window.addEventListener('DOMContentLoaded', () => {
    const select = el('debate-turns');
    for (let n = 6; n <= 12; n++) { const option = document.createElement('option'); option.value = String(n); option.textContent = `${n}회 (ChatGPT ${Math.ceil(n / 2)} / Gemini ${Math.floor(n / 2)})`; select.append(option); }
    el('debate-form').onsubmit = async event => {
      event.preventDefault(); if (active || running) return;
      el('debate-fields').disabled = true; setStatus('비밀번호와 서버 연결을 확인하고 있습니다…');
      try {
        const topic = el('debate-topic').value.trim();
        const totalTurns = Number(select.value);
        const data = await request('/debates/start', { password: el('debate-password').value, topic, totalTurns, openaiPosition: el('debate-openai-position').value.trim(), geminiPosition: el('debate-gemini-position').value.trim() });
        active = { ...data, topic, totalTurns, turns: [] };
        el('debate-password').value = '';
        el('debate-view-title').textContent = topic;
        el('debate-positions').textContent = `ChatGPT: ${el('debate-openai-position').value}\nGemini: ${el('debate-gemini-position').value}`;
        renderTurns([]); renderSummary(null); await advance();
      } catch (error) { setStatus(error.message); el('debate-fields').disabled = false; }
    };
    el('debate-resume').onclick = advance;
    loadList();
  });
  window.addEventListener('beforeunload', event => { if (active) { event.preventDefault(); event.returnValue = ''; } });
})();
