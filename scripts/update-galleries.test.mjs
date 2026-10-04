import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { updateGallery, selectCreativeScene, creativePrompt } from './update-galleries.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cosmic-gallery-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

test('NASA six-hour publication respects KST slots and needs no OpenAI key', async t => {
  const root = await fixture(t);
  let calls = 0;
  const request = async (url, options) => {
    calls++;
    if (options.method === 'HEAD') return new Response(null, { headers: { 'content-type': 'image/jpeg' } });
    if (String(url).includes('/asset/')) return Response.json({ collection: { items: [{ href: 'https://images-assets.nasa.gov/image/test~medium.jpg' }] } });
    assert.match(String(url), /^https:\/\/images-api.nasa.gov\/search/);
    return Response.json({ collection: { items: [{ data: [{ nasa_id: `test-nebula-${calls}`, title: 'Nebula' }], links: [{ href: 'https://images-assets.nasa.gov/image/test.jpg', render: 'image' }] }] } });
  };
  const now = new Date('2026-10-03T23:37:00Z');
  assert.equal(await updateGallery('photos', { root, now, request, apiKey: '' }), true);
  const posts = JSON.parse(await fs.readFile(path.join(root, 'data/photo-gallery.json')));
  assert.equal(posts[0].date, '2026-10-04');
  assert.equal(await updateGallery('photos', { root, now, request }), false);
  assert.equal(calls, 3);
  assert.equal(await updateGallery('photos', { root, now: new Date('2026-10-04T03:37:00Z'), request, apiKey: '' }), true);
  assert.equal(calls, 6);
  assert.equal(await updateGallery('photos', { root, now, request, apiKey: '', force: true }), true);
  assert.equal(calls, 9);
  const refreshed = JSON.parse(await fs.readFile(path.join(root, 'data/photo-gallery.json')));
  assert.equal(refreshed.length, 3);
  assert.equal(new Set(refreshed.map(post => post.nasaId)).size, 3);
});

test('AI uses the exact model, smallest square, low quality and one request per KST slot', async t => {
  const root = await fixture(t);
  let calls = 0;
  const prompts = [];
  const request = async (url, options) => {
    calls++;
    const body = JSON.parse(options.body);
    prompts.push(body.prompt);
    assert.equal(body.model, 'gpt-image-2.5-flare');
    assert.equal(body.quality, 'low');
    assert.equal(body.size, '816x816');
    assert.equal(body.n, 1);
    assert.match(body.prompt, /하나의 주된 천문학적 대상 또는 시스템/);
    for (const group of 'ABCDEF') assert.equal([...body.prompt.matchAll(new RegExp(`^${group}\\d+\\.`, 'gm'))].length, 1);
    return Response.json({ data: [{ b64_json: Buffer.from('RIFF0000WEBPtest').toString('base64') }] });
  };
  const options = { root, request, apiKey: 'test-only', now: new Date('2026-10-03T21:37:00Z') };
  assert.equal(await updateGallery('creative', options), true);
  assert.equal(await updateGallery('creative', { ...options, now: new Date('2026-10-03T22:59:00Z') }), false);
  assert.equal(await updateGallery('creative', { ...options, now: new Date('2026-10-03T23:37:00Z') }), true);
  assert.equal(calls, 2);
  const posts = JSON.parse(await fs.readFile(path.join(root, 'data/creative-gallery.json')));
  assert.equal(posts[0].descriptionSource, 'pending');
  assert.equal(posts[0].description, undefined);
  assert.equal(posts[0].generationPrompt, prompts[1]);
  for (const [g, n] of Object.entries(posts[0].generationSelection)) assert.ok(posts[0].generationPrompt.includes(`${g}${n}.`));
  assert.equal(posts[0].generationVersion, 1);
  assert.deepEqual(Object.keys(posts[0].generationSelection), [...'ABCDEF']);
  assert.match(posts[0].generationPrompt, /816×816/);
  assert.equal(await updateGallery('creative', { ...options, force: true }), true);
  assert.equal(await updateGallery('creative', { ...options, force: true }), true);
  assert.equal(calls, 4);
  const refreshed = JSON.parse(await fs.readFile(path.join(root, 'data/creative-gallery.json')));
  assert.equal(refreshed.length, 4);
  assert.equal(new Set(refreshed.map(post => post.id)).size, 4);
  assert.equal(new Set(refreshed.map(post => post.url)).size, 4);
  for (const post of refreshed) assert.ok((await fs.stat(path.join(root, post.url))).size > 0);
});

test('API failure preserves existing posts and never retries the paid request', async t => {
  const root = await fixture(t);
  await fs.mkdir(path.join(root, 'data'));
  const existing = '[{"id":"previous","slot":"old"}]\n';
  const file = path.join(root, 'data/creative-gallery.json');
  await fs.writeFile(file, existing);
  let calls = 0;
  await assert.rejects(updateGallery('creative', { root, apiKey: 'test-only', request: async () => { calls++; return new Response('', { status: 429 }); } }), /HTTP 429/);
  assert.equal(calls, 1);
  assert.equal(await fs.readFile(file, 'utf8'), existing);
});

test('old six-hour creative posts migrate using their publication timestamp', async t => {
  const root = await fixture(t);
  await fs.mkdir(path.join(root, 'data'));
  await fs.writeFile(path.join(root, 'data/creative-gallery.json'), JSON.stringify([{ slot: 'old-format', publishedAt: '2026-10-03T21:37:00Z' }]));
  assert.equal(await updateGallery('creative', { root, now: new Date('2026-10-03T22:00:00Z'), request: () => { throw new Error('Must not call API'); } }), false);
});

test('page scripts parse and all gallery tab targets exist', async () => {
  const html = await fs.readFile(new URL('../index.html', import.meta.url), 'utf8');
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
  for (const asset of ['community.js', 'cosmic-scenes.js']) new vm.Script(await fs.readFile(new URL(`../assets/${asset}`, import.meta.url), 'utf8'));
  assert.ok(!html.includes('cosmicLore('));
  for (const tab of ['photos', 'creative', 'forum', 'briefing', 'book', 'dog']) {
    assert.ok(html.includes(`id="tab-btn-${tab}"`));
    assert.ok(html.includes(`id="tab-content-${tab}"`));
  }
});

test('scene selection avoids recent subjects and stores reproducible combination keys', () => {
  const history = [];
  for (let i = 0; i < 80; i++) {
    const scene = selectCreativeScene(history, max => i % max);
    assert.ok(!history.slice(0, 3).some(post => post.generationSelection.A === scene.selection.A));
    assert.equal(scene.key, Object.entries(scene.selection).map(([g, n]) => `${g}${n}`).join('-'));
    assert.ok(creativePrompt(scene).includes(scene.title));
    history.unshift({ generationSelection: scene.selection });
  }
});
