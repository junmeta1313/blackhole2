import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { updateGallery } from './update-galleries.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cosmic-gallery-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

test('NASA daily publication respects KST date, skips duplicates and needs no OpenAI key', async t => {
  const root = await fixture(t);
  let calls = 0;
  const request = async (url, options) => {
    calls++;
    if (options.method === 'HEAD') return new Response(null, { headers: { 'content-type': 'image/jpeg' } });
    if (String(url).includes('/asset/')) return Response.json({ collection: { items: [{ href: 'https://images-assets.nasa.gov/image/test~medium.jpg' }] } });
    assert.match(String(url), /^https:\/\/images-api.nasa.gov\/search/);
    return Response.json({ collection: { items: [{ data: [{ nasa_id: 'test-nebula', title: 'Nebula' }], links: [{ href: 'https://images-assets.nasa.gov/image/test.jpg', render: 'image' }] }] } });
  };
  const now = new Date('2026-10-03T23:37:00Z');
  assert.equal(await updateGallery('photos', { root, now, request, apiKey: '' }), true);
  const posts = JSON.parse(await fs.readFile(path.join(root, 'data/photo-gallery.json')));
  assert.equal(posts[0].date, '2026-10-04');
  assert.equal(await updateGallery('photos', { root, now, request }), false);
  assert.equal(calls, 3);
});

test('AI uses the exact model, smallest square, low quality and one request per KST slot', async t => {
  const root = await fixture(t);
  let calls = 0;
  const request = async (url, options) => {
    calls++;
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'gpt-image-2.5-flare');
    assert.equal(body.quality, 'low');
    assert.equal(body.size, '816x816');
    assert.equal(body.n, 1);
    assert.ok(body.prompt.length < 180);
    return Response.json({ data: [{ b64_json: Buffer.from('RIFF0000WEBPtest').toString('base64') }] });
  };
  const options = { root, request, apiKey: 'test-only', now: new Date('2026-10-03T21:37:00Z') };
  assert.equal(await updateGallery('creative', options), true);
  assert.equal(await updateGallery('creative', { ...options, now: new Date('2026-10-04T02:59:00Z') }), false);
  assert.equal(await updateGallery('creative', { ...options, now: new Date('2026-10-04T03:37:00Z') }), true);
  assert.equal(calls, 2);
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

test('page scripts parse and all gallery tab targets exist', async () => {
  const html = await fs.readFile(new URL('../index.html', import.meta.url), 'utf8');
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
  for (const tab of ['photos', 'creative', 'forum', 'briefing']) {
    assert.ok(html.includes(`id="tab-btn-${tab}"`));
    assert.ok(html.includes(`id="tab-content-${tab}"`));
  }
});

