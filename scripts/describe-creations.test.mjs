import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describeImage, describePendingCreations, storyRequest } from './describe-creations.mjs';

const image = Buffer.from('RIFF0000WEBPactual-image-bytes');
const story = { title: '빛이 머문 곳', visibleFeatures: ['얇은 고리', '구름의 그림자', '어두운 배경'], description: '고리의 그림자가 옅은 구름 위에 머물렀다. '.repeat(35) + '\n\n다음 전송에는 다른 계절의 빛이 담길 것이다.' };
const completed = () => Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(story) }] }], usage: { input_tokens: 1100, output_tokens: 900 } });

async function fixture(t, count = 1) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cosmic-stories-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'data'));
  await fs.mkdir(path.join(root, 'assets/creative'), { recursive: true });
  const posts = Array.from({ length: count }, (_, i) => ({ id: `post-${i}`, title: '기존 제목', storyForm: 'old-template', description: '기존 고정 설명', url: `./assets/creative/test-${i}.webp` }));
  for (const post of posts) await fs.writeFile(path.join(root, post.url), image);
  await fs.writeFile(path.join(root, 'data/creative-gallery.json'), JSON.stringify(posts));
  return { root, file: path.join(root, 'data/creative-gallery.json') };
}

test('request attaches actual image bytes, disables reasoning and contains no fixed story', async () => {
  const payload = storyRequest(image);
  const content = payload.input[0].content;
  assert.equal(content[1].type, 'input_image');
  assert.equal(content[1].image_url, `data:image/webp;base64,${image.toString('base64')}`);
  assert.equal(content[1].detail, 'high');
  assert.equal(payload.model, 'gpt-6-luna');
  assert.equal(payload.reasoning.effort, 'none');
  assert.equal(payload.max_output_tokens, 2400);
  assert.equal(payload.tools, undefined);
  assert.match(payload.instructions, /가상의 천문 관측 설명문/);
  assert.match(payload.instructions, /공백 포함 약 800~1,000자/);
  assert.match(payload.instructions, /수치와 관측 기록을 최소 하나/);
  assert.match(payload.instructions, /마지막 2~4문장/);
  assert.match(payload.instructions, /원인은 아직 밝혀지지 않았다는 열린 결말/);
  assert.match(payload.instructions, /본문에서 가상이라는 안내를 반복하지 않는다/);
  assert.doesNotMatch(payload.instructions, /700-1200|science-fiction story|standard discovery-date-distance opening/);
  const result = await describeImage(image, { apiKey: 'test', request: async (url, options) => { assert.equal(url, 'https://api.openai.com/v1/responses'); assert.deepEqual(JSON.parse(options.body), payload); return completed(); } });
  assert.equal(result.description, story.description);
});

test('existing images are described once, persisted and skipped on later runs', async t => {
  const { root, file } = await fixture(t, 2);
  let calls = 0;
  const options = { root, apiKey: 'test', request: async () => { calls++; return completed(); } };
  assert.equal(await describePendingCreations(options), 2);
  assert.equal(await describePendingCreations(options), 0);
  assert.equal(calls, 2);
  const posts = JSON.parse(await fs.readFile(file));
  assert.equal(posts[0].originalTitle, '기존 제목');
  assert.equal(posts[0].descriptionSource, 'vision-ai');
  assert.equal(posts[0].descriptionModel, 'gpt-6-luna');
  assert.equal(posts[0].title, story.title);
  assert.equal(posts[0].storyForm, undefined);
  assert.equal(posts[0].descriptionUsage.input_tokens, 1100);
  assert.deepEqual(await fs.readFile(path.join(root, posts[0].url)), image);
});

test('failure preserves images, old story and completed earlier work without paid retry', async t => {
  const { root, file } = await fixture(t, 2);
  let calls = 0;
  await assert.rejects(describePendingCreations({ root, apiKey: 'test', request: async () => { calls++; return calls === 1 ? completed() : new Response('', { status: 429 }); } }), /HTTP 429/);
  assert.equal(calls, 2);
  const posts = JSON.parse(await fs.readFile(file));
  assert.equal(posts[0].descriptionSource, 'vision-ai');
  assert.equal(posts[1].description, '기존 고정 설명');
  assert.deepEqual(await fs.readFile(path.join(root, posts[1].url)), image);
  assert.equal(await describePendingCreations({ root, apiKey: 'test', request: async () => { calls++; return completed(); } }), 1);
  assert.equal(calls, 3);
});

test('incomplete or invalid model output is not saved', async () => {
  for (const result of [{ status: 'incomplete' }, { status: 'completed', output_text: JSON.stringify({ ...story, description: '너무 짧음' }) }, { status: 'completed', output_text: 'not-json' }]) {
    await assert.rejects(describeImage(image, { apiKey: 'test', request: async () => Response.json(result) }));
  }
});

test('backfill limit saves partial work and rejects paths outside the gallery', async t => {
  const { root, file } = await fixture(t, 2);
  assert.equal(await describePendingCreations({ root, apiKey: 'test', limit: 1, request: async () => completed() }), 1);
  const posts = JSON.parse(await fs.readFile(file));
  posts[1].url = './assets/creative/../../secret.webp';
  await fs.writeFile(file, JSON.stringify(posts));
  await assert.rejects(describePendingCreations({ root, request: () => { throw new Error('Must not call'); } }), /Only repository/);
});
