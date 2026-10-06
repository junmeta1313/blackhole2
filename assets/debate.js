(() => {
  const API = 'https://quiet-recipe-f7be.kuji5757.workers.dev';
  const cancellationKey = 'debate-pending-cancellation';
  const replyDelayMs = 7000;
  let active = null, running = false, departed = false, pageGeneration = 0;
  function rememberCancellation(session) {
    try { sessionStorage.setItem(cancellationKey, JSON.stringify({ id: session.id, token: session.token })); } catch { /* Beacon still works without storage. */ }
  }
  function forgetCancellation() {
    try { sessionStorage.removeItem(cancellationKey); } catch { /* Storage may be disabled. */ }
  }
  function cancelOnExit(session) {
    const url = API + `/debates/${session.id}/cancel`;
    const body = JSON.stringify({ token: session.token });
    // text/plain permits a cross-origin beacon without an unload-time preflight.
    if (navigator.sendBeacon?.(url, new Blob([body], { type: 'text/plain' }))) return;
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body, keepalive: true }).catch(() => {});
  }
  const el = id => document.getElementById(id);
  async function request(path, body) {
    const response = await fetch(API + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(80000) } : { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : '서버 연결을 확인해주세요.');
    return data;
  }
  function setStatus(text, preparing = false) {
    el('debate-status').textContent = text;
    el('debate-status').classList.toggle('is-preparing', preparing);
  }
  function showTyping(speaker) {
    const typing = el('debate-typing');
    typing.className = speaker === 'ChatGPT' ? 'debate-openai' : 'debate-gemini';
    typing.querySelector('span').textContent = `${speaker} · 입력중....`;
    typing.hidden = false;
  }
  function hideTyping() { el('debate-typing').hidden = true; }
  function renderPositions(openai, gemini) {
    const box = el('debate-positions'); box.replaceChildren();
    for (const [label, text, side] of [['ChatGPT 입장', openai, 'openai'], ['Gemini 입장', gemini, 'gemini']]) {
      const card = document.createElement('article'); card.className = `debate-position debate-${side}`;
      const heading = document.createElement('strong'); heading.textContent = label;
      const body = document.createElement('p'); body.textContent = text;
      card.append(heading, body); box.append(card);
    }
  }
  function renderTurns(turns, focusLatest = true) {
    const chat = el('debate-chat'); chat.replaceChildren();
    for (const [i, turn] of turns.entries()) {
      const bubble = document.createElement('article');
      bubble.className = 'debate-bubble ' + (turn.speaker === 'openai' ? 'debate-openai' : 'debate-gemini');
      const name = document.createElement('strong'); name.textContent = `${i + 1}. ${turn.speaker === 'openai' ? 'ChatGPT' : 'Gemini'}`;
      const text = document.createElement('p'); text.textContent = turn.text;
      bubble.append(name, text); chat.append(bubble);
    }
    if (focusLatest && turns.length) {
      const latest = chat.lastElementChild;
      const previousLine = turns.length > 1 ? 64 : 0;
      // Space below short messages lets their beginning reach the top of the log.
      const spacer = document.createElement('div'); spacer.className = 'debate-chat-spacer';
      spacer.setAttribute('aria-hidden', 'true');
      spacer.style.height = `${Math.max(0, chat.clientHeight - latest.offsetHeight - previousLine)}px`;
      chat.append(spacer);
      const top = latest.getBoundingClientRect().top - chat.getBoundingClientRect().top + chat.scrollTop;
      chat.scrollTop = Math.max(0, top - previousLine);
    } else chat.scrollTop = 0;
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
            renderPositions(debate.openaiPosition, debate.geminiPosition);
            renderTurns(debate.turns, false); renderSummary(debate.summary); setStatus('저장된 토론 기록입니다.');
          } catch (error) { setStatus(error.message); }
        };
        list.append(button);
      }
    } catch { list.textContent = '토론 서버 설정 후 게시글 목록이 표시됩니다.'; }
  }
  async function advance() {
    if (!active || running) return;
    const session = active;
    running = true; el('debate-fields').disabled = true; el('debate-resume').hidden = true;
    try {
      while (active) {
        const summarizing = active.turns.length >= active.totalTurns;
        const speaker = active.turns.length % 2 === 0 ? 'ChatGPT' : 'Gemini';
        const preparing = active.turns.length < 2 ? '입장 발표 준비중입니다...' : '반박 준비중입니다...';
        setStatus(summarizing ? 'Gemini가 양측 주장 요약을 정리하고 있습니다…' : `${speaker} · ${preparing} (${active.turns.length + 1}/${active.totalTurns})`, true);
        if (!summarizing) showTyping(speaker);
        else hideTyping();
        // Start the API call immediately; hold each completed reply until seven
        // seconds have elapsed. Slow API calls keep the indicator visible longer.
        let [data] = await Promise.all([
          request(`/debates/${session.id}/turn`, { token: session.token, expectedTurn: session.turns.length }),
          new Promise(resolve => setTimeout(resolve, summarizing ? 0 : replyDelayMs))
        ]);
        if (active !== session) return;
        hideTyping();
        if (data.summaryReady) {
          data = await request(`/debates/${session.id}/publish`, { token: session.token });
          if (active !== session) return;
        }
        if (data.completed) {
          renderTurns(data.debate.turns); renderSummary(data.debate.summary);
          active = null; forgetCancellation(); setStatus('토론이 완료되어 게시글로 저장됐습니다.'); await loadList(); break;
        }
        if (data.synced) active.turns = data.debate.turns;
        else active.turns.push(data.turn);
        renderTurns(active.turns);
      }
    } catch (error) {
      if (active !== session) return;
      hideTyping();
      setStatus(`${error.message} 기존 발언은 유지됩니다. 계속하기를 누르면 추가 API 비용이 발생할 수 있습니다.`);
      el('debate-resume').hidden = !active;
    } finally { running = false; el('debate-fields').disabled = !!active; }
  }
  window.loadDebateBoard = loadList;
  window.addEventListener('DOMContentLoaded', () => {
    // Recover only enough information to cancel a lost page, never to resume it.
    try {
      const previous = JSON.parse(sessionStorage.getItem(cancellationKey) || 'null');
      if (previous?.id && previous?.token) {
        request(`/debates/${previous.id}/cancel`, { token: previous.token }).then(() => {
          if (sessionStorage.getItem(cancellationKey) === JSON.stringify(previous)) forgetCancellation();
        }).catch(() => {});
      }
    } catch { forgetCancellation(); }
    const select = el('debate-turns');
    for (let n = 4; n <= 8; n++) { const option = document.createElement('option'); option.value = String(n); option.textContent = `${n}회 (ChatGPT ${Math.ceil(n / 2)} / Gemini ${Math.floor(n / 2)})`; select.append(option); }
    el('debate-form').onsubmit = async event => {
      event.preventDefault(); if (active || running) return;
      el('debate-fields').disabled = true; setStatus('비밀번호와 서버 연결을 확인하고 있습니다…');
      const startedOnPage = pageGeneration;
      try {
        const topic = el('debate-topic').value.trim();
        const totalTurns = Number(select.value);
        const data = await request('/debates/start', { password: el('debate-password').value, topic, totalTurns, openaiPosition: el('debate-openai-position').value.trim(), geminiPosition: el('debate-gemini-position').value.trim() });
        if (departed || startedOnPage !== pageGeneration) { rememberCancellation(data); cancelOnExit(data); return; }
        active = { ...data, topic, totalTurns, turns: [] };
        rememberCancellation(active);
        el('debate-password').value = '';
        el('debate-view-title').textContent = topic;
        renderPositions(el('debate-openai-position').value, el('debate-gemini-position').value);
        renderTurns([]); renderSummary(null);
        el('debate-status').scrollIntoView({ behavior: 'smooth', block: 'start' });
        await advance();
      } catch (error) { setStatus(error.message); el('debate-fields').disabled = false; }
    };
    el('debate-resume').onclick = advance;
    loadList();
  });
  window.addEventListener('pagehide', () => {
    departed = true; pageGeneration++;
    if (!active) return;
    const session = active; active = null;
    cancelOnExit(session);
    hideTyping();
    renderTurns([]); renderSummary(null);
    el('debate-resume').hidden = true; el('debate-fields').disabled = false;
    setStatus('페이지를 나가 진행 중인 토론이 종료됐습니다. 게시글로 저장되지 않습니다.');
  });
  window.addEventListener('pageshow', () => { departed = false; });
})();
