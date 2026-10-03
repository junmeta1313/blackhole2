import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomInt, randomUUID } from 'node:crypto';
import '../assets/cosmic-lore.js';

const SIX_HOURS = 6 * 60 * 60 * 1000;
const FOUR_HOURS = 4 * 60 * 60 * 1000;
const KST_OFFSET = 9 * 60 * 60 * 1000;
const subjects = [
  ['별빛의 요람', 'a luminous nebula with newborn stars'],
  ['고요한 은하', 'a spiral galaxy above a distant alien ocean'],
  ['심연의 빛', 'a black hole with a glowing accretion disk'],
  ['얼음 행성의 새벽', 'an icy exoplanet with rings and two moons'],
  ['우주의 정원', 'colorful interstellar dust and distant star clusters'],
  ['보랏빛 지평선', 'a violet nebula beyond a rocky alien horizon'],
  ['별의 잔향', 'a supernova remnant with luminous filaments'],
  ['시간의 파도', 'a gravitational lens around a distant galaxy']
];

async function readFeed(file) {
  try {
    const data = JSON.parse(await fs.readFile(file, 'utf8'));
    if (!Array.isArray(data)) throw new Error('Gallery feed must be an array');
    return data;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function saveFeed(file, posts) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(`${file}.tmp`, `${JSON.stringify(posts, null, 2)}\n`);
  await fs.rename(`${file}.tmp`, file);
}

export async function updateGallery(mode, { now = new Date(), root = process.cwd(), request = fetch, apiKey = process.env.OPENAI_API_KEY, force = false } = {}) {
  if (!['photos', 'creative'].includes(mode)) throw new Error('Mode must be photos or creative');
  const file = path.join(root, 'data', `${mode === 'photos' ? 'photo' : 'creative'}-gallery.json`);
  const posts = await readFeed(file);
  const date = new Date(now.getTime() + KST_OFFSET).toISOString().slice(0, 10);
  const interval = mode === 'photos' ? SIX_HOURS : FOUR_HOURS;
  const slot = `${mode}-${Math.floor((now.getTime() + KST_OFFSET) / interval)}`;
  if (!force && posts.some(post => post.slot === slot || (post.publishedAt && Math.floor((new Date(post.publishedAt).getTime() + KST_OFFSET) / interval) === Math.floor((now.getTime() + KST_OFFSET) / interval)))) {
    console.log(`${mode}: already published for this period`);
    return false;
  }
  if (force) console.log(`${mode}: manual test run; bypassing publication period limit`);

  if (mode === 'photos') {
    const terms = ['nebula', 'galaxy', 'black hole', 'star cluster', 'Saturn', 'supernova'];
    const start = Math.floor(now.getTime() / 86400000) % terms.length;
    for (let offset = 0; offset < terms.length; offset++) {
      const term = terms[(start + offset) % terms.length];
      const endpoint = new URL('https://images-api.nasa.gov/search');
      endpoint.search = new URLSearchParams({ q: term, media_type: 'image', page_size: '100' });
      const response = await request(endpoint, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`NASA search failed: HTTP ${response.status}`);
      const result = await response.json();
      const candidates = (result.collection?.items || []).filter(item => {
        const data = item.data?.[0];
        return data?.nasa_id && data.title && !posts.some(post => post.nasaId === data.nasa_id) && item.links?.some(link => /^https:\/\//.test(link.href) && link.render === 'image');
      });
      if (!candidates.length) continue;
      const item = candidates[randomInt(candidates.length)];
      const data = item.data[0];
      const image = item.links.find(link => /^https:\/\//.test(link.href) && link.render === 'image');
      const assetResponse = await request(`https://images-api.nasa.gov/asset/${encodeURIComponent(data.nasa_id)}`, { signal: AbortSignal.timeout(30000) });
      if (!assetResponse.ok) throw new Error(`NASA asset lookup failed: HTTP ${assetResponse.status}`);
      const assets = ((await assetResponse.json()).collection?.items || []).flatMap(asset => {
        try {
          const url = new URL(asset.href);
          if (url.hostname !== 'images-assets.nasa.gov') return [];
          url.protocol = 'https:';
          return [url.href];
        } catch { return []; }
      });
      const imageUrl = assets.find(url => /~medium\.(jpg|png)$/i.test(url)) || assets.find(url => /~orig\.(jpg|png)$/i.test(url)) || image.href;
      const imageResponse = await request(imageUrl, { method: 'HEAD', signal: AbortSignal.timeout(30000) });
      if (!imageResponse.ok || !imageResponse.headers.get('content-type')?.startsWith('image/')) continue;
      await saveFeed(file, [{ id: `nasa-${data.nasa_id}`, slot, nasaId: data.nasa_id, title: data.title, url: imageUrl, author: 'NASA 이미지 라이브러리', date, credit: data.photographer || data.secondary_creator || data.center || 'NASA', sourceUrl: `https://images.nasa.gov/details/${encodeURIComponent(data.nasa_id)}`, publishedAt: now.toISOString() }, ...posts]);
      console.log('photos: published one NASA image (no AI tokens)');
      return true;
    }
    throw new Error('No new NASA image available');
  }

  if (!apiKey) throw new Error('OPENAI_API_KEY is required in GitHub Actions secrets');
  const [title, subject] = subjects[randomInt(subjects.length)];
  const mood = ['iridescent dust', 'impossible luminous geometry', 'crystalline star trails', 'delicate rainbow filaments'][randomInt(4)];
  const prompt = `Mysterious, strange, beautiful cosmic art: ${subject}, ${mood}. Vivid colors, no text.`;
  // Scheduled runs are slot-limited; manual tests make one fresh paid request.
  const response = await request('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-2.5-flare', prompt, quality: 'low', size: '816x816', n: 1, output_format: 'webp', output_compression: 80 }),
    signal: AbortSignal.timeout(240000)
  });
  if (!response.ok) throw new Error(`Image generation failed: HTTP ${response.status}. Check API billing and model access.`);
  const result = await response.json();
  const encoded = result.data?.[0]?.b64_json;
  if (typeof encoded !== 'string' || !encoded) throw new Error('Image API returned no image');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') throw new Error('Invalid WebP response');
  const generationId = `${slot}-${randomUUID()}`;
  const imagePath = `assets/creative/cosmic-${generationId}.webp`;
  await fs.mkdir(path.join(root, 'assets', 'creative'), { recursive: true });
  await fs.writeFile(path.join(root, imagePath), bytes);
  await saveFeed(file, [{ id: `ai-${generationId}`, slot, title, description: globalThis.cosmicLore(title, generationId), url: `./${imagePath}`, author: 'AI 창작', date, publishedAt: now.toISOString(), model: 'gpt-image-2.5-flare', quality: 'low' }, ...posts]);
  console.log(`creative: published one image; usage=${JSON.stringify(result.usage || {})}`);
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await updateGallery(process.argv[2], { force: process.argv.includes('--force') });
}
