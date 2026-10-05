(() => {
  const formatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  window.updateBoardTimestamp = function (board, posts, status = 'loaded') {
    const targets = document.querySelectorAll(`[data-board-updated="${board}"]`);
    if (!targets.length) return;
    // Briefing publication dates belong to the source article. createdAt is
    // when our site added the briefing; galleries use their publishedAt.
    const field = board === 'briefing' ? 'createdAt' : 'publishedAt';
    const times = (Array.isArray(posts) ? posts : []).map(post => {
      const value = post?.[field];
      return typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? Date.parse(value) : NaN;
    }).filter(Number.isFinite);
    let text;
    if (status === 'error') text = '마지막 추가 시간을 확인하지 못했습니다. 잠시 후 새로고침해주세요.';
    else if (times.length) {
      const parts = Object.fromEntries(formatter.formatToParts(new Date(Math.max(...times))).map(part => [part.type, part.value]));
      text = `마지막 추가: ${parts.year}.${parts.month}.${parts.day} ${parts.hour}:${parts.minute} (한국시간)`;
    } else text = posts?.length ? '마지막 추가 시각이 기록되어 있지 않습니다.' : '아직 자동으로 추가된 자료가 없습니다.';
    targets.forEach(target => { target.textContent = text; });
  };
})();
