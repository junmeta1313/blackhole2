# AI 토론 연결 (기존 Worker 유지)

현재 Worker와 D1을 그대로 사용합니다. 새 계정이나 Worker는 필요 없습니다.

1. Cloudflare → D1 → 기존 `briefing-rate-limits` → Console.
   `debate-schema.sql` 전체를 실행합니다. 기존 브리핑 제한 표는 유지됩니다.
2. Workers & Pages → `quiet-recipe-f7be` → Settings → Variables and Secrets.
   다음 두 개를 **Secret**으로 추가합니다:
   - `GEMINI_API_KEY`: 사용자가 만든 Google Gemini 키
   - `DEBATE_PASSWORD`: 사용자가 정한 토론 비밀번호
   기존 `OPENAI_API_KEY`, `DB` 연결은 유지합니다.
3. Edit code에서 `deploy.js` 전체로 교체 후 Deploy.
   `index.mjs`는 로컬 모듈을 import하므로 대시보드에 한 파일로 붙일 때는
   반드시 **deploy.js**를 사용하세요. 기존 브리핑 질문 기능도 포함됩니다.
4. `https://quiet-recipe-f7be.kuji5757.workers.dev/debates/health` 접속.
   ready true이면 새 표와 필수 Secret이 연결됐습니다. 실제 모델 권한/응답 성공은
   이 상태 확인과 별개입니다.
5. 홈페이지 AI 토론에서 주제/양측 입장/비밀번호 입력 후 총 4회로 첫 테스트.
   총 4~8회 선택 가능합니다. 4회 = ChatGPT 2회, Gemini 2회.
   5회면 ChatGPT 3회, Gemini 2회.
   마지막에 Gemini가 양측을 요약하고 게시글로 저장합니다.

비밀번호와 API 키는 홈페이지·GitHub 코드에 포함되지 않습니다.
비밀번호 입력은 서버가 확인하고, 시작 후 긴 임의 실행 토큰으로 요청을 검증합니다.
완료된 게시글은 방문자 누구나 열람할 수 있지만 토론 시작에는 비밀번호가 필요합니다.

## 모델과 비용

- OpenAI: gpt-6-luna, 표준 처리, reasoning low, verbosity low, 검색 도구 없음.
- Google: gemini-3.5-flash-lite, thinkingLevel LOW.
- 발언 횟수 + Gemini 요약 1회의 API 호출 비용이 발생합니다. 이미 완료된 기록을
  다시 열 때 AI 호출은 없습니다.
- 사용자 요청으로 Gemini 3.5 Flash-Lite와 낮은 사고 수준을 적용합니다.
  https://ai.google.dev/gemini-api/docs/models
  https://ai.google.dev/api/generate-content#ThinkingConfig
- IP당 시작 시도는 10초에 한 번입니다. 미완료 토론이 있어도 새 토론을 시작할 수 있습니다.
  발언은 하나씩 원자적 lease로 잠가 중복 요청을 차단합니다.
- 발언은 3개 문단으로 나누고, 가벼운 비꼼과 근거 중심의 날카로운 비판을 사용합니다.
  브라우저는 API 호출과 동시에 7초 표시 타이머를 시작하며, 응답이 느리면 완료까지
  입력 중 표시를 유지합니다. 저장된 기록을 열 때는 지연 없이 표시합니다.
- Gemini 발언은 JSON의 문단 3개를 받아 빈 줄로 연결합니다. 각 문단의 목표는
  공백 포함 142~155자이며 전체 목표는 430~470자입니다. JSON 기호와 사고 내용은
  제외하고 한글을 NFC로 정규화합니다. 400~500자는 두 모델에 전달하는 작성 지시이며,
  서버는 길이에 따라 발언을 거절하거나 토론을 멈추지 않습니다. 빈 응답·잘못된 형식·
  API 실패 시 자동 유료
  재호출 없이 일시정지합니다. 계속하기는 사용자가 선택하며 추가 비용이 발생할 수
  있습니다. 기존 성공 발언은 D1에 유지됩니다.
- 페이지를 나가거나 새로고침하면 `pagehide`에서 인증된 취소 요청을 beacon으로 보냅니다.
  진행 중인 발언과 요약은 지우고, 이미 생성 중인 응답의 늦은 저장도 차단합니다.
  탭의 sessionStorage에는 재진입 시 취소를 재시도할 id와 토큰만 임시 보관하며,
  대화 복원이나 이어하기에는 사용하지 않습니다.
- 요약 생성만으로는 게시되지 않습니다. 열린 페이지가 `/publish`로 완료를 확인해야
  게시글이 등록됩니다. 브라우저 강제 종료나 네트워크 단절로 취소가 전달되지 않아도
  미완료 기록이 새 토론을 막거나 서버에서 자동 게시되는 일은 없습니다.
  이미 API에 전달된 생성 요청에는 비용이 발생할 수 있습니다.
- 완료된 기록은 페이지를 나가도 D1에 남고 최신 50개 게시글을 목록에 표시합니다.

## 코드 관리와 테스트

`node scripts/build-worker.mjs`로 배포용 단일 파일을 다시 만듭니다.
`node --test worker/*.test.mjs`로 비밀번호, 교대 발언, 저장, 동시 요청, 오류를
mock API와 SQLite로 검증합니다. 실제 API 통합 확인은 사용자 배포 후 진행합니다.

## 발언 횟수 범위 변경

신규 토론은 서버와 화면 모두 총 4~8회로 제한합니다. 기본 선택은 4회입니다.
기존 DB의 최소 6회 CHECK 제약은 업데이트된 Worker에서 최초 유효 시작 요청 시
D1 batch 트랜잭션으로 자동 변경합니다. 모든 기존 행·인덱스·트리거를 복사하고,
오류가 나면 트랜잭션 전체를 롤백합니다. DB의 저장 범위는 기존 9~12회 기록을
보존하기 위해 4~12회를 허용하지만, 신규 API 입력은 8회를 넘길 수 없습니다.
D1 Console에서 SQL을 추가로 실행할 필요는 없습니다.

## 답변 글자 수 변경

`debate.mjs`의 `DEBATE_REPLY_LENGTH = { min: 400, max: 500 }` 한 곳에서 설정합니다.
AI 지시문과 개별 발언 요청의 목표 분량이 이 값을 사용합니다. 서버의 글자 수 범위 검사는 없습니다.
GitHub 소스를 수정한 뒤에는 `node scripts/build-worker.mjs`로 `deploy.js`를 재생성합니다.
Cloudflare 단일 파일에서 직접 바꿀 때도 `DEBATE_REPLY_LENGTH` 한 줄만 수정하고 Deploy합니다.
