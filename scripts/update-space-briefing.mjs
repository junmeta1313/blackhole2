import fs from "node:fs/promises";
import path from "node:path";

const DATA_FILE = path.join(process.cwd(), "data", "space-briefing.json");
const MAX_STORED_POSTS = 240; // 약 5일치: 2건 × 24시간 × 5일

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error("OPENAI_API_KEY가 없습니다. GitHub 저장소의 Actions secret에 등록하세요.");
}

async function readExisting() {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

function stripCodeFence(text) {
  return text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeTitle(value) {
  return String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function validateItems(items) {
  if (!Array.isArray(items) || items.length !== 2) {
    throw new Error(`OpenAI 응답은 정확히 2건이어야 합니다. 현재: ${Array.isArray(items) ? items.length : "배열 아님"}`);
  }

  return items.map((item, index) => {
    const url = normalizeUrl(item.url);
    if (!item.title || !item.summary || !item.source || !item.type || !url) {
      throw new Error(`${index + 1}번째 항목에 필수 값이 빠졌습니다.`);
    }
    return {
      title: String(item.title).trim(),
      originalTitle: String(item.originalTitle ?? "").trim(),
      summary: String(item.summary).trim(),
      source: String(item.source).trim(),
      type: String(item.type).trim(),
      url,
      publishedAt: String(item.publishedAt ?? "").trim()
    };
  });
}

const existing = await readExisting();
const recentForPrompt = existing.slice(0, 40).map((p) => ({
  title: p.title,
  url: p.url
}));

const now = new Date();
const prompt = `
현재 시각은 ${now.toISOString()}이다.

너는 신뢰도 높은 우주·천문학 전문 편집자다. 웹 검색을 사용해서 최근 공개된 전 세계 우주/천문학 기사, 공식 발표, 연구 논문을 조사하라.

목표:
- 이번 실행에서 게시할 자료를 정확히 2건만 선정한다.
- 한국 독자가 이해하기 쉽게 한국어로 번역·요약한다.
- 단순 흥미성 기사보다 과학적 중요도와 최신성이 높은 자료를 우선한다.

우선순위:
1. 새 연구 논문 또는 관측 결과
2. NASA, ESA, ESO, JAXA, ISRO, CNSA, NOIRLab, STScI 등 우주/천문 기관의 공식 발표
3. Nature, Science, ApJ, AJ, A&A, MNRAS, PRL 및 arXiv의 중요한 논문
4. 주요 우주 임무, 망원경, 행성과학, 별/은하/블랙홀/중력파/우주론/외계행성 관련 중대한 새 결과

선정 규칙:
- 우선 최근 72시간 자료를 찾는다.
- 중요한 자료가 2건 미만이면 최근 7일까지 범위를 넓힌다.
- 같은 사건/논문을 다룬 중복 보도는 하나만 선택한다.
- 아래 기존 게시물과 같은 URL 또는 사실상 같은 주제는 제외한다.
- 클릭 유도성 기사, 근거가 약한 주장, 출처 불명 자료는 제외한다.
- 정확히 2건을 반환한다.

기존 최근 게시물:
${JSON.stringify(recentForPrompt)}

항목 작성 규칙:
- type이 '기사' 또는 '공식발표'라면 summary에는 짧은 3~5문장 요약을 쓰지 않는다. 원문의 전체 흐름을 한국어 독자가 이해할 수 있도록 충분히 자세하게 재서술한다.
- 기사/공식발표의 상세 재서술에는 가능하면 다음 내용을 포함한다: 배경, 핵심 사건 또는 발표 내용, 주요 수치와 관측 결과, 연구자/기관 설명의 취지, 앞으로의 의미.
- 기사 원문 문장을 길게 복사하거나 문단 단위로 직역하지 않는다. 원문을 대신할 수 있는 복제본이 아니라, 사실관계를 유지한 상세한 한국어 설명문으로 작성한다.
- type이 '논문'이라면 summary에 연구 목적, 사용한 데이터/방법, 핵심 결과, 연구의 의미와 한계를 중심으로 6~10문장 정도로 요약한다.
- 기사/공식발표는 논문 요약보다 훨씬 자세하게 작성하되, 확인되지 않은 내용을 덧붙이지 않는다.
- 모든 항목에서 사실과 해석을 구분하고 과장된 표현을 피한다.

title은 자연스러운 한국어 제목으로 번역한다.
originalTitle에는 원문의 제목을 적는다.
type은 '논문', '공식발표', '기사' 중 하나만 사용한다.
source에는 실제 출처명만 적는다.
url에는 실제 원문 또는 공식 논문 페이지의 https URL을 적는다.
publishedAt은 원문의 공개일을 가능한 경우 YYYY-MM-DD 형식으로 적는다.

반드시 아래 JSON 배열만 출력하고, 설명이나 마크다운 코드블록을 붙이지 마라.
[
  {
    "title": "한국어 제목",
    "originalTitle": "원문 제목",
    "summary": "한국어 요약",
    "source": "출처명",
    "type": "논문|공식발표|기사",
    "url": "https://...",
    "publishedAt": "YYYY-MM-DD"
  },
  { ... }
]
`;

const response = await fetch("https://api.openai.com/v1/responses", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model: "gpt-6-luna",
    tools: [{ type: "web_search" }],
    input: prompt,
    max_output_tokens: 7000
  })
});

if (!response.ok) {
  const body = await response.text();
  throw new Error(`OpenAI API 오류 ${response.status}: ${body}`);
}

const result = await response.json();
const searchCalls = (result.output ?? []).filter(item => item.type === 'web_search_call').length;
console.log(`API usage: ${JSON.stringify({ model: 'gpt-6-luna', usage: result.usage ?? null, web_search_calls: searchCalls })}`);
const outputText = result.output_text ?? result.output
  ?.flatMap((item) => item.content ?? [])
  ?.filter((c) => c.type === "output_text")
  ?.map((c) => c.text)
  ?.join("\n");

if (!outputText) throw new Error("OpenAI 응답에 텍스트가 없습니다.");

let selected;
try {
  selected = validateItems(JSON.parse(stripCodeFence(outputText)));
} catch (error) {
  console.error("파싱 실패 응답:", outputText);
  throw error;
}

const existingUrls = new Set(existing.map((p) => normalizeUrl(p.url)).filter(Boolean));
const existingTitles = new Set(existing.map((p) => normalizeTitle(p.title)).filter(Boolean));
const runUrls = new Set();
const runTitles = new Set();

for (const item of selected) {
  const titleKey = normalizeTitle(item.title);
  if (existingUrls.has(item.url) || existingTitles.has(titleKey) || runUrls.has(item.url) || runTitles.has(titleKey)) {
    throw new Error(`중복 항목이 감지되어 이번 실행을 중단합니다: ${item.title}`);
  }
  runUrls.add(item.url);
  runTitles.add(titleKey);
}

const formatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});
const displayTime = formatter.format(now).replace(/\. /g, "-").replace(".", "");

const newPosts = selected.map((item, index) => ({
  id: `${now.getTime()}-${index + 1}`,
  title: item.title,
  originalTitle: item.originalTitle,
  summary: item.summary,
  source: item.source,
  type: item.type,
  url: item.url,
  publishedAt: item.publishedAt,
  date: displayTime,
  createdAt: now.toISOString()
}));

const next = [...newPosts, ...existing].slice(0, MAX_STORED_POSTS);
await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
await fs.writeFile(DATA_FILE, JSON.stringify(next, null, 2) + "\n", "utf8");

console.log(`완료: 우주 브리핑 ${newPosts.length}건 추가`);
for (const post of newPosts) console.log(`- ${post.title} (${post.source})`);


