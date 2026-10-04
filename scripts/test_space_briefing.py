import datetime as dt
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('briefing', Path(__file__).with_name('update-space-briefing.py'))
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)
NOW = dt.datetime(2026, 10, 4, 0, 17, tzinfo=dt.timezone.utc)


def story(source='NASA', number=1, age=1):
    titles = {1: 'Webb telescope discovers distant galaxy', 2: 'Mars spacecraft maps ancient river', 3: 'Black hole gravitational waves detected'}
    return {'title': titles.get(number, f'Saturn moon ocean discovery {number}'), 'url': f'https://www.nasa.gov/story-{number}', 'source': source, 'type': '공식발표', 'publishedAt': (NOW - dt.timedelta(days=age)).isoformat(), 'excerpt': 'A telescope observes a distant galaxy. ' * 40}


def summaries(items, key):
    return [{'id': str(i), 'title': '우주 소식', 'sentences': ['관측 결과를 발표했습니다.'] * 5} for i in range(len(items))]


class BriefingTests(unittest.TestCase):
    def test_url_normalization(self):
        self.assertEqual(b.normalize_url('http://www.nasa.gov/story/?utm_source=x#top'), 'https://www.nasa.gov/story')
        self.assertEqual(b.normalize_url('https://arxiv.org/pdf/2601.12345v3.pdf'), 'https://arxiv.org/abs/2601.12345')
        self.assertEqual(b.normalize_url('javascript:alert(1)'), '')

    def test_duplicate_urls_and_original_titles(self):
        item = story()
        self.assertTrue(b.same_story(item, {**item, 'title': '번역 제목'}))
        self.assertTrue(b.same_story(item, {**item, 'url': 'https://www.esa.int/other', 'originalTitle': item['title']}))
        self.assertFalse(b.same_story(item, story(number=99)))

    def test_selection_recency_duplicates_and_diversity(self):
        existing = [story(number=1)]
        selected = b.select_candidates([story(number=1), story(number=2), story('ESA', 3), story(number=4, age=9), {**story(number=5), 'title': 'Funding', 'excerpt': 'administration'}], existing, NOW)
        self.assertEqual({i['source'] for i in selected}, {'NASA', 'ESA'})
        self.assertEqual(len(selected), 2)

    def test_feed_parsing(self):
        rss = '<rss><channel><item><title>Webb galaxy</title><link>https://www.nasa.gov/news/</link><pubDate>Sat, 03 Oct 2026 00:00:00 GMT</pubDate><description>&lt;p&gt;Galaxy findings&lt;/p&gt;</description></item></channel></rss>'
        self.assertEqual(b.parse_feed(rss, 'NASA', '공식발표')[0]['excerpt'], 'Galaxy findings')
        atom = '<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Black hole</title><published>2026-10-03T00:00:00Z</published><id>http://arxiv.org/abs/2610.00001v1</id><summary>Abstract</summary></entry></feed>'
        self.assertEqual(b.parse_feed(atom, 'arXiv', '논문')[0]['url'], 'https://arxiv.org/abs/2610.00001')

    def test_payload_only_selected_material(self):
        payload = b.build_request([{**story(), 'excerpt': 'x' * 9000}, story('ESA', 2)])
        self.assertNotIn('tools', payload)
        self.assertEqual(payload['reasoning']['effort'], 'none')
        self.assertEqual(payload['max_output_tokens'], 1600)
        self.assertEqual(len(json.loads(payload['input'])[0]['excerpt']), 4500)
        self.assertEqual(len(json.loads(payload['input'])), 2)

    def test_article_extraction(self):
        self.assertEqual(b.plain_text('<nav>Menu</nav><main><p>Useful text</p><script>Bad text</script></main>', article=True), 'Useful text')

    def test_daily_limit_and_single_call(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.object(b, 'collect', return_value=[story(), story('ESA', 2)]), patch.dict(os.environ, {'OPENAI_API_KEY': 'test'}):
                calls = []
                def summarize(items, key):
                    calls.append(len(items))
                    return summaries(items, key)
                self.assertEqual(b.run(root, NOW, summarizer=summarize), 2)
                self.assertEqual(b.run(root, NOW, summarizer=summarize), 0)
                self.assertEqual(calls, [2])
                posts = json.loads((root / 'data/space-briefing.json').read_text(encoding='utf-8'))
                self.assertEqual(len(posts), 2)
                self.assertEqual(len(posts[0]['summary'].splitlines()), 5)

    def test_one_remaining_slot(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'data').mkdir()
            file = root / 'data/space-briefing.json'
            file.write_text(json.dumps([{'title': '기존 글', 'url': 'https://www.nasa.gov/old', 'date': '2026-10-04 08:00'}]), encoding='utf-8')
            with patch.object(b, 'collect', return_value=[story(), story('ESA', 2)]), patch.dict(os.environ, {'OPENAI_API_KEY': 'test'}):
                self.assertEqual(b.run(root, NOW, summarizer=summaries), 1)
                self.assertEqual(len(json.loads(file.read_text(encoding='utf-8'))), 2)

    def test_force_adds_new_stories_but_never_duplicates_or_recharges_old_sources(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            calls = []
            def summarize(items, key):
                calls.append([item['url'] for item in items])
                return summaries(items, key)
            with patch.dict(os.environ, {'OPENAI_API_KEY': 'test'}):
                with patch.object(b, 'collect', return_value=[story(), story('ESA', 2)]):
                    self.assertEqual(b.run(root, NOW, summarizer=summarize), 2)
                file = root / 'data/space-briefing.json'
                original = json.loads(file.read_text(encoding='utf-8'))
                candidates = [story(), story('ESA', 2), story(number=3), story('ESA', 99)]
                with patch.object(b, 'collect', return_value=candidates):
                    self.assertEqual(b.run(root, NOW, summarizer=summarize, force=True), 2)
                    posts = json.loads(file.read_text(encoding='utf-8'))
                    self.assertEqual(posts[2:], original)
                    self.assertEqual(len({post['url'] for post in posts}), 4)
                    self.assertEqual(b.run(root, NOW, summarizer=summarize, force=True), 0)
                    self.assertEqual(file.read_text(encoding='utf-8'), json.dumps(posts, ensure_ascii=False, indent=2) + '\n')
                    self.assertEqual(b.run(root, NOW, summarizer=summarize), 0)
                self.assertEqual(len(calls), 2)
                self.assertTrue(set(calls[0]).isdisjoint(calls[1]))

    def test_force_failure_preserves_full_daily_feed_without_retry(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'data').mkdir()
            file = root / 'data/space-briefing.json'
            original = json.dumps([{'title': '기존 글', 'url': f'https://www.nasa.gov/old-{i}', 'date': '2026-10-04 08:00'} for i in range(2)])
            file.write_text(original, encoding='utf-8')
            with patch.object(b, 'collect', return_value=[story(), story('ESA', 2)]), patch.dict(os.environ, {'OPENAI_API_KEY': 'test'}):
                with patch.object(b, 'summarize', side_effect=RuntimeError('API failed')) as summarize:
                    with self.assertRaisesRegex(RuntimeError, 'API failed'):
                        b.run(root, NOW, summarizer=summarize, force=True)
                    summarize.assert_called_once()
            self.assertEqual(file.read_text(encoding='utf-8'), original)

    def test_failed_summary_preserves_data(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'data').mkdir()
            file = root / 'data/space-briefing.json'
            file.write_text('[]', encoding='utf-8')
            with patch.object(b, 'collect', return_value=[story(), story('ESA', 2)]), patch.dict(os.environ, {'OPENAI_API_KEY': 'test'}):
                with self.assertRaises(ValueError):
                    b.run(root, NOW, summarizer=lambda items, key: [])
            self.assertEqual(file.read_text(encoding='utf-8'), '[]')


if __name__ == '__main__':
    unittest.main()
