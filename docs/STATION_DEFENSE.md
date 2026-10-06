# EVENT HORIZON: STATION DEFENSE

홈페이지 메인 → **게임하기** → 소개 화면 → **게임 시작하기**로 진입합니다.
브라우저에서 실행하는 PC 키보드 전용 Canvas 2D 게임입니다. 별도 서버·API 키·
Cloudflare 배포가 필요하지 않습니다. 기존 Pages 배포는 assets를 포함하므로 게임도 함께 배포됩니다.

## 파일 구조

| 파일 | 역할 |
| --- | --- |
| `index.html` | 메인 카드·게임하기 탭·소개·HUD·메뉴의 HTML 연결 |
| `assets/game/station-defense/main.js` | 시작·전체화면·설정·HUD·일시정지·종료·재시작 수명 관리 |
| `config.js` | 1920×1080 좌표계·난이도·모든 핵심 밸런스·테마·업그레이드·설정 기본값 |
| `engine.js` | 플레이어·정거장·적 6종·보스·충돌·웨이브·스킬·점수·상태 머신 |
| `input.js` | 키보드 입력·숫자키 업그레이드 우선 처리·PC/모바일 판정 |
| `loader.js` | 이미지 preload/decode·진행률·12초 타임아웃·실패 fallback·캐시 |
| `renderer.js` | Retina Canvas·함선 스프라이트·성운·별 레이어·탄환·폭발·보호막·드론·EMP |
| `audio.js` | Start 동작 후 Web Audio 활성화·효과음·음량·노드 정리 |
| `game.css` | 게임 소개·전체화면 HUD·업그레이드·설정·PC 전용 안내 스타일 |
| `art/*.webp` | 최적화된 로컬 이미지 10개, 합계 약 527KB |
| `engine.test.mjs` | 물리·웨이브·적 역할·스킬·보스·설정·기기 판정 테스트 |
| `scripts/prepare-game-art.py` | 제공 ZIP에서 투명 스프라이트 분리 및 WebP 최적화 재현 |

게임 코드의 전역 변수는 ES module 내부에 한정됩니다. 기존 Worker/API·브리핑·갤러리
생성 스크립트는 수정하지 않았습니다. 기존 파일 변경은 `index.html`뿐입니다.

## 레퍼런스 적용

- **01**: 소개 화면의 실제 hero 이미지. **03**: 실제 전투 배경.
- **04·05**: 실제 정거장·플레이어 스프라이트.
- **06**: 연결된 투명 영역을 분리해 Scout/Rusher 스프라이트로 사용.
- **07**: Tank/Shooter/Shield 스프라이트로 분리. Splitter는 Scout 3기의 결합체로
  표현하며 파괴 시 3개의 작은 드론으로 분열합니다.
- **08**: 독립된 보스 스프라이트로 사용.
- **02**: 절제된 어두운 여백과 금속 소재의 스타일 참고.
- **09**: HUD의 위치·선·건강바·스킬 슬롯 스타일 참고. 글자와 수치는 실제 HTML로 렌더링.
- **10**: 미사일·EMP·수리 아이콘과 에너지 효과 참고. SVG 및 Canvas 애니메이션으로 구현.

외부 이미지 hotlink나 추가 AI 이미지 생성은 없습니다. 원본 ZIP은 브라우저에서 로딩하지 않습니다.
에셋 재생성은 Pillow가 설치된 환경에서 `python scripts/prepare-game-art.py <ZIP 경로>`로 실행합니다.

## 게임 시스템

- 마지막 이동 방향으로 조준. 방향키의 대각 이동은 정규화합니다. Space 연속 사격,
  Shift 약 150ms 대시와 짧은 무적, 1 유도 미사일, 2 정거장 중심 EMP, 3 수리 드론.
- 정거장 500 Hull + 160 Shield. Shield가 먼저 피해를 흡수하고 6초간 피격되지 않으면
  초당 8 회복합니다. 최대 Hull에서는 수리 스킬을 사용하지 않습니다.
- 플레이어 기본 HP 100, 플라즈마 피해 10, 초당 약 5발, 대시 기본 쿨타임 2초.
  접촉 피해는 정거장 충돌 피해보다 낮게 적용하고 적을 밀어냅니다. 웨이브 진입 때 HP 25 회복.
- 미사일 기본 8초, EMP 15초, 수리 25초. 수리는 드론 3기가 5초간 총 Hull 80 회복.
  EMP는 일반 적을 멈추고 범위 내 적 탄환을 제거하지만 보스에게는 짧은 감속만 적용.
- Scout 1 / Rusher 2 / Tank 3 / Shooter 4 / Splitter 6 / Shield 7웨이브부터 해금.
  웨이브마다 증가하는 threat budget으로 적 조합을 뽑고 0.7초 경고 후 출현합니다.
- 모든 5번째 웨이브에 VOID DREADNOUGHT가 등장합니다. 부채꼴 탄막·소형 함선 소환·
  사전 경고가 있는 정거장 광선 공격을 사용합니다. HP 50%에서 Phase 2로 가속합니다.
- 웨이브 종료 후 2.8초 휴식, 업그레이드 카드 3개. 최대 레벨에 도달한 강화는 제외하고
  가능한 경우 방어 관련 선택지를 하나 포함합니다. 업그레이드는 클릭 또는 숫자키로 선택.
- 13종 업그레이드: 피해·속사·관통·삼중탄·추진·Hull·Shield·조종사 HP·미사일 피해·
  추가 미사일·EMP·수리·스킬 냉각. 끝 웨이브 제한 없이 생존과 최고 점수를 도전합니다.
- 처치·웨이브·보스·연속 처치·피해 없는 웨이브·남은 Hull로 점수를 계산합니다.
  플레이어 HP 또는 정거장 Hull이 0이면 종료. 다시 시작은 페이지 새로고침 없이 전체 초기화.

## 설정과 저장

설정 화면에서 난이도(쉬움/보통/어려움), 자동 사격, 약한 조준 보조, 효과음·음량,
화면 흔들림, 효과 수준, 조작 힌트를 선택합니다. 조준 보조는 마지막 이동 방향 근처의
약 26도 범위 안에서만 작동하며 마우스 조준으로 바뀌지 않습니다. 난이도는 게임을
시작하기 전에 정하고 나머지는 일시정지 중 저장 즉시 적용합니다.
`prefers-reduced-motion`이면 흔들림을 끄고 강한 움직임을 줄입니다.

localStorage namespace는 `eventHorizonStationDefense.`입니다.

| key | 내용 |
| --- | --- |
| `settings` | 게임·오디오·화면·힌트 설정 |
| `bestScore` | 이 브라우저의 최고 점수 |
| `bestWave` | 이 브라우저의 최고 웨이브 |
| `tutorialSeen` | 최초 조작 힌트를 확인했는지 |

localStorage가 차단되어도 플레이할 수 있습니다. 기록은 기기 간 동기화되지 않고
공개 순위표나 서버 저장을 제공하지 않습니다. 일반 홈페이지 로그인과 별개입니다.

## 전체화면과 기기 판정

Start 클릭 안에서 `requestFullscreen({navigationUI:'hide'})`를 요청합니다.
지원되지 않거나 거부되면 fixed/inset 0/100dvw/100dvh의 동일 shell을 사용합니다.
내부 좌표는 1920×1080으로 고정하고 16:9 letterbox로 비율을 보존합니다.
Canvas backing buffer DPR은 2로 제한합니다.

모바일 UA·maxTouchPoints·primary coarse pointer·any/primary fine pointer를 조합합니다.
스마트폰은 차단하고 터치 전용 태블릿도 차단합니다. fine pointer가 있는 터치 PC는
허용합니다. 모바일 Start에서는 안내 모달만 표시하고 Canvas·전투 에셋·전체화면·
게임 루프·오디오를 초기화하지 않습니다. 소개 화면 이미지만 미리 로딩됩니다.

Fullscreen 해제·탭 숨김·window blur 때 일시정지하며 복귀만으로 재개하지 않습니다.
로딩 도중 전체화면이 해제되어도 준비 완료 후 일시정지됩니다.
P/계속하기로 재개하고 ESC는 일시정지합니다. 종료 시 RAF·키 이벤트·활성 키·효과음·
AudioContext·Canvas를 정리하고 body scroll과 게시판 화면을 복구합니다.

## 검증

```bash
node --test assets/game/station-defense/engine.test.mjs worker/*.test.mjs
python -m http.server 8765
```

자동화한 엔진 테스트 16개, 기존 Worker 테스트 22개, 갤러리·생성 테스트 16개 등
Node.js 테스트 총 54개를 실행했습니다.
실제 Chromium에서 게임 진입, Space/방향키/Shift/1·2·3, 고해상도 Canvas, 전체화면
해제 후 pause/resume, focus loss, 업그레이드 숫자키, 게임오버와 재시작, 반복 종료·재진입,
기존 7개 게시판 이동, 모바일 실행 차단, 전체화면 거절 fallback, resize, 설정 저장을 확인했습니다.
`scripts/test-station-defense-browser.py`는 Playwright와 Chromium을 사용합니다.
Tailwind 스크립트를 `/tmp/sd-tailwind.js`로 캐시한 뒤 로컬 서버를 켜고
`python scripts/test-station-defense-browser.py`로 재현할 수 있습니다.
브라우저 테스트의 AI/API 요청은 mock 처리해 유료 호출하지 않았습니다.
보스/업그레이드/게임오버 검사는 테스트 환경에서 상태를 구성한 뒤 실제 입력·렌더링·
저장·전환을 검사했습니다. 정상 게임에는 테스트용 전역 변수나 무적 모드가 없습니다.

프로젝트는 60FPS를 목표로 고정 timestep·객체 수 상한·HUD 10Hz 갱신·절제된 효과를 사용합니다.
실제 성능과 난이도 체감은 PC 사양·주사율·조작 숙련도에 따라 달라지므로 모든 기기에서
60FPS 또는 특정 생존 시간을 보장하지 않습니다. 최초 버전 밸런스는 `config.js`에서 조절할 수 있습니다.
