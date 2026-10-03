(function () {
    globalThis.cosmicLore = function (title, seed) {
        let hash = 2166136261;
        for (const character of String(seed)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
        const distance = (12000 + hash % 88000000).toLocaleString('ko-KR');
        const instruments = ['꿈결 간섭계', '유리별 심우주 망원경', '시간파동 관측소', '오로라 중력렌즈 배열'];
        const signals = ['희미한 적외선 잔광', '주기적으로 접히는 별빛', '먼지 사이를 흐르는 청록색 파동', '빛의 고리에서 새어 나오는 자줏빛 섬광'];
        const mysteries = ['중심부에서는 별들이 서로의 그림자를 공전한다고 전해진다.', '성운의 가장자리에는 아직 태어나지 않은 별의 흔적이 남아 있다.', '관측 기록에는 같은 빛이 서로 다른 시대에서 도착한 것처럼 나타난다.', '얼음처럼 투명한 먼지는 가까이 다가갈수록 무지갯빛으로 갈라진다.'];
        return `가상의 관측 대상 ‘${title}’의 위치는 지구에서 약 ${distance}광년 떨어진 미지의 영역이다. ${2400 + hash % 300}년, 관측 장비 ‘${instruments[hash % instruments.length]}’의 기록에서 ${signals[(hash >>> 4) % signals.length]}이 발견되면서 처음 알려졌다. 연구진은 약 ${(hash % 900 + 100) / 10}광년에 걸친 구조가 느리게 회전하며 빛을 재배열한다고 추측했다. ${mysteries[(hash >>> 8) % mysteries.length]} 탐사선은 아직 도착하지 않았고, 그 아름다운 형상의 정체는 이 상상의 우주에서도 수수께끼로 남아 있다.`;
    };
})();
