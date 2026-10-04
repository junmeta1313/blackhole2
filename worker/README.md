# 브리핑 질문 서버 연결

홈페이지는 https://quiet-recipe-f7be.kuji5757.workers.dev/ 를 사용합니다.
API 키를 홈페이지 또는 GitHub 파일에 넣지 마세요.

## Cloudflare 대시보드에서 적용

1. Storage & databases → D1 → Create database에서 `briefing-rate-limits` 생성.
2. 만든 데이터베이스의 Console에서 `schema.sql` 전체를 실행.
3. Workers & Pages → `quiet-recipe-f7be` → Settings/Bindings에서 D1 Database
   바인딩 추가. 변수 이름은 **DB**, 데이터베이스는 위에서 만든 DB 선택.
4. Worker Settings → Variables and Secrets:
   - 기존 **OPENAI_API_KEY** Secret 유지.
   - **ALLOWED_ORIGIN** 일반 변수: `https://junmeta1313.github.io`
5. Edit code에서 `deploy.js` 전체로 교체하고 Deploy. 기존 브리핑과 AI 토론 코드를 포함합니다.
6. Worker 주소 뒤에 `/health`를 붙여 접속.
   `{"ready":true,"version":1,...}`이면 DB/필수 설정 연결이 완료된 상태입니다.
   이는 OpenAI 모델 권한·결제·실제 답변 성공까지 검증하는 것은 아닙니다.
7. 홈페이지 우주 브리핑의 [질문하기]에서 한 번 질문하여 실제 연결 확인.
   같은 IP에서 다른 글에 즉시 질문하면 429/대기 안내가 나와야 합니다.

Cloudflare 설정에 접근할 권한이 이 작업 환경에는 없어서 위 배포는 사용자가
진행해야 합니다. 초기 Worker 코드로는 질문 기능이 활성화되지 않습니다.

## 동작과 비용

- gpt-6-luna, 표준 처리(service_tier default), reasoning low, verbosity low.
- 웹 검색 도구는 필수, 한 요청에서 최대 1회. 결과 본문은 500자 이내.
- 원문 URL과 브리핑은 GitHub main 데이터에서 조회합니다. 클라이언트가 임의
  원문 주소를 보낼 수 없습니다. 허용된 NASA/ESA/arXiv/APS 원문에서 최대
  64KB를 읽고 텍스트 발췌 6,000자만 전달합니다. 원문 실패 시 이를 AI에 명시하고
  브리핑과 검색으로 답합니다. 사이트 정책/리다이렉트 때문에 원문 미확보 가능.
- 최근 대화 최대 6개 메시지만 전달. 대화는 브라우저 메모리 외 저장하지 않습니다.
  요청은 OpenAI에 전달됩니다. store false는 플랫폼의 별도 보존 정책과 구분됩니다.
- 실제 IP와 마지막 요청 시각만 D1에 저장. 추가 IP_HASH_SECRET은 필요 없습니다. 공개 IP를 공유하는 회사/가족은
  60초 제한도 공유합니다. 질문과 답변은 DB에 저장하지 않습니다.
  기존 DB와 호환되도록 컬럼명 ip_hash는 유지하지만 이 컬럼에는 실제 IP가 들어갑니다.
- DB의 조건부 UPSERT가 동시에 들어온 요청을 원자적으로 제한합니다.
  실패한 AI 요청도 60초 제한에 포함되고 유료 자동 재시도는 없습니다.
- 요청 Origin 검사는 브라우저 연결 범위를 제한하며 사용자 인증은 아닙니다.
- Workers 무료 CPU 한도는 10ms이므로 실제 Cloudflare Metrics에서 확인하세요.
  웹 응답 대기 시간은 CPU 시간에 포함되지 않습니다.
- Worker/DB 무료 한도와 별개로 OpenAI 토큰·검색 요금이 발생합니다.

## 테스트

`node --test worker/index.test.mjs` (mock API, 실제 비용 없음).
전체 사이트 변경 검증은 갤러리 Node 테스트와 함께 실행합니다.

## 선택: Wrangler로 배포

`wrangler.jsonc`의 database_id를 실제 ID로 바꾸고 로그인 후:

```sh
npx wrangler d1 execute briefing-rate-limits --remote --file=worker/schema.sql
cd worker
npx wrangler secret put OPENAI_API_KEY
npx wrangler deploy
```

비밀값은 프롬프트 입력만 사용하고 파일에 저장하지 않습니다.

AI 토론 추가 설정은 `DEBATE_SETUP.md`를 참고하세요.
