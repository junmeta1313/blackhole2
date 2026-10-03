(function () {
    const recommendations = [
        ['코스모스', 'Cosmos', 'Carl Sagan', '우주와 인류를 잇는 과학 이야기'],
        ['시간의 역사', 'A Brief History of Time', 'Stephen Hawking', '블랙홀과 시공간의 첫걸음'],
        ['창백한 푸른 점', 'Pale Blue Dot', 'Carl Sagan', '우주 속 지구의 자리'],
        ['웰컴 투 더 유니버스', 'Welcome to the Universe', 'Neil deGrasse Tyson', '별과 은하, 현대 천문학'],
        ['Astrophysics for People in a Hurry', 'Astrophysics for People in a Hurry', 'Neil deGrasse Tyson', '짧게 읽는 천체물리학'],
        ['블랙홀과 시간 굴곡', 'Black Holes and Time Warps', 'Kip S. Thorne', '상대성이론과 블랙홀 탐구']
    ];
    const aliases = { '우주': 'space', '천문학': 'astronomy', '블랙홀': 'black holes', '은하': 'galaxies', '별': 'stars', '행성': 'planets', '코스모스': 'Cosmos', '시간의 역사': 'A Brief History of Time', '창백한 푸른 점': 'Pale Blue Dot' };
    let page = 1, currentQuery = '', busy = false, lastRequest = 0;
    const cache = new Map();
    const el = id => document.getElementById(id);
    const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

    function renderBooks(data) {
        const list = el('book-results');
        list.replaceChildren();
        for (const book of data.docs || []) {
            if (!/^\/works\/OL\d+W$/.test(book.key)) continue;
            const row = document.createElement('article');
            row.className = 'book-row';
            const cover = document.createElement('img');
            const frame = document.createElement('div');
            frame.className = 'w-14 h-[84px] bg-zinc-900 flex items-center justify-center text-xs text-gray-500';
            const placeholder = document.createElement('span');
            placeholder.textContent = '표지 없음';
            frame.append(placeholder);
            cover.alt = `${book.title} 표지`;
            cover.loading = 'lazy';
            if (Number.isInteger(book.cover_i)) {
                cover.hidden = true;
                cover.onload = () => { cover.hidden = false; placeholder.hidden = true; };
                cover.onerror = () => { cover.remove(); placeholder.hidden = false; };
                frame.append(cover);
                cover.src = `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg?default=false`;
            }
            const details = document.createElement('div');
            const title = document.createElement('h4');
            const link = document.createElement('a');
            link.href = `https://openlibrary.org${book.key}`;
            link.target = '_blank'; link.rel = 'noopener noreferrer';
            link.className = 'font-bold text-emerald-200 hover:text-white';
            link.textContent = book.title;
            title.append(link);
            const metadata = document.createElement('p');
            metadata.className = 'text-sm text-gray-400 mt-2';
            metadata.textContent = `${(book.author_name || []).join(', ') || '저자 미상'} · ${book.first_publish_year || '발행연도 미상'}`;
            details.append(title, metadata); row.append(frame, details); list.append(row);
        }
        const total = data.numFound ?? data.num_found ?? 0;
        el('book-status').textContent = total ? `${total.toLocaleString('ko-KR')}권 · ${page}페이지` : '검색 결과가 없습니다. 영어 제목이나 다른 키워드로 검색해보세요.';
        el('book-pagination').hidden = !total;
        el('book-page').textContent = `${page} / ${Math.max(1, Math.ceil(total / 12))}`;
        el('book-prev').disabled = page === 1;
        el('book-next').disabled = page * 12 >= total;
    }

    async function searchBooks(query, nextPage = 1) {
        if (busy) return;
        query = query.trim();
        if (!query) query = 'astronomy';
        busy = true; currentQuery = query; page = nextPage;
        el('book-search-button').disabled = true;
        el('book-prev').disabled = el('book-next').disabled = true;
        el('book-status').textContent = '책을 찾고 있습니다…';
        el('book-results').replaceChildren();
        el('book-pagination').hidden = true;
        const language = el('book-language').value;
        const translated = aliases[query] || query;
        const recommended = recommendations.find(item => item[0] === query || item[1] === query);
        const q = recommended ? `title:"${recommended[1]}" AND author:"${recommended[2]}"` : `(${translated.replace(/["()\\:]/g, ' ')}) AND (subject:astronomy OR subject:cosmology OR subject:astrophysics OR subject:"space exploration" OR subject:astronautics)`;
        const url = new URL('https://openlibrary.org/search.json');
        url.search = new URLSearchParams({ q: q + (language ? ` AND language:${language}` : ''), fields: 'key,title,author_name,first_publish_year,cover_i', limit: '12', page: String(page), lang: 'ko' });
        try {
            let data = cache.get(url.href);
            if (!data) {
                await sleep(Math.max(0, 1100 - (Date.now() - lastRequest)));
                lastRequest = Date.now();
                const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                data = await response.json();
                if (!Array.isArray(data.docs)) throw new Error('Invalid book data');
                cache.set(url.href, data);
            }
            renderBooks(data);
        } catch {
            el('book-status').textContent = '책 검색에 실패했습니다. 잠시 후 검색 버튼으로 다시 시도해주세요.';
        } finally {
            busy = false; el('book-search-button').disabled = false;
        }
    }

    async function randomDog() {
        const button = el('dog-random'), status = el('dog-status'), image = el('dog-image');
        if (button.disabled) return;
        button.disabled = true; status.hidden = false; image.hidden = true;
        try {
            // Finish the countdown before issuing the request; preload before revealing.
            for (let number = 3; number >= 1; number--) {
                status.textContent = String(number); status.style.fontSize = '64px';
                await sleep(1000);
            }
            status.style.fontSize = '16px'; status.textContent = '친구가 오고 있어요…';
            const response = await fetch('https://dog.ceo/api/breeds/image/random', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
            if (!response.ok) throw new Error('Dog API unavailable');
            const data = await response.json();
            const url = new URL(data.message);
            if (data.status !== 'success' || url.protocol !== 'https:' || url.hostname !== 'images.dog.ceo') throw new Error('Invalid dog image');
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => { image.src = ''; reject(new Error('Image timeout')); }, 15000);
                image.onload = () => { clearTimeout(timer); resolve(); };
                image.onerror = () => { clearTimeout(timer); reject(new Error('Image unavailable')); };
                image.src = url.href;
            });
            image.hidden = false; status.hidden = true;
        } catch {
            status.style.fontSize = '16px'; status.textContent = '친구를 불러오지 못했어요. 다시 눌러주세요.';
        } finally {
            image.onload = image.onerror = null; button.disabled = false;
        }
    }

    window.addEventListener('DOMContentLoaded', () => {
        for (const [name, title, author, note] of recommendations) {
            const button = document.createElement('button');
            button.className = 'text-left border-l-2 border-emerald-300/40 pl-3 hover:border-emerald-200';
            const heading = document.createElement('span'); heading.className = 'block text-gray-100 font-bold'; heading.textContent = name;
            const detail = document.createElement('span'); detail.className = 'block text-xs text-gray-400 mt-1 leading-5'; detail.textContent = `${author} · ${note}`;
            button.append(heading, detail);
            button.onclick = () => { if (busy) return; el('book-query').value = title; searchBooks(title); };
            el('book-recommendations').append(button);
        }
        el('book-search-form').addEventListener('submit', event => { event.preventDefault(); searchBooks(el('book-query').value); });
        el('book-prev').onclick = () => searchBooks(currentQuery, page - 1);
        el('book-next').onclick = () => searchBooks(currentQuery, page + 1);
        el('dog-random').onclick = randomDog;
    });
})();
