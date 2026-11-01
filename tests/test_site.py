"""Offline catalogue checks; optional HTTP checks against a local Caddy server."""
from collections import Counter
from html.parser import HTMLParser
import os
from pathlib import Path
import re
import unittest
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]


class Catalogue(HTMLParser):
    def __init__(self):
        super().__init__()
        self.services = {}
        self.current = None
        self.assets = set()
        self.inline = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'li' and 'data-service' in attrs:
            self.current = dict(attrs)
            self.services[attrs['data-id']] = self.current
        if tag == 'a' and self.current is not None:
            self.current['href'] = attrs.get('href', '')
        if tag in {'script', 'link'}:
            self.assets.add(attrs.get('src', attrs.get('href', '')))
        if tag == 'style' or (tag == 'script' and not attrs.get('src')):
            self.inline.append(tag)
        self.inline.extend(key for key in attrs if key == 'style' or key.startswith('on'))

    def handle_endtag(self, tag):
        if tag == 'li':
            self.current = None


def catalogue():
    parser = Catalogue()
    parser.feed((ROOT / 'web/index.html').read_text())
    return parser


class CatalogueTests(unittest.TestCase):
    def test_service_links_and_access_labels(self):
        services = catalogue().services
        self.assertEqual(len(services), 14)
        self.assertEqual(Counter(s['data-access'] for s in services.values()),
                         {'public': 5, 'sso': 4, 'private': 5})
        hosts = set()
        for service in services.values():
            url = urlsplit(service['href'])
            self.assertEqual(url.scheme, 'https')
            self.assertFalse(url.username or url.password or url.query or url.port)
            self.assertTrue(url.hostname.endswith(('.lab.bingo', '.bingops.com')))
            hosts.add(url.hostname)
        self.assertEqual(len(hosts), 14)
        for service_id in ('coder', 'dev', 'portal', 'argocd', 'grafana'):
            self.assertEqual(services[service_id]['data-access'], 'private')

    def test_services_are_grouped_by_purpose(self):
        services = catalogue().services
        expected = {
            'work': {'notes', 'coder', 'dev'},
            'games': {'games', 'slots', 'rom', 'requests'},
            'infra': {'portal', 'argocd', 'grafana', 'status', 'auth'},
            'about': {'portfolio', 'blog'},
        }
        for category, ids in expected.items():
            actual = {name for name, s in services.items() if s['data-category'] == category}
            self.assertEqual(actual, ids)

    def test_assets_work_under_the_local_only_content_security_policy(self):
        parser = catalogue()
        self.assertEqual(parser.inline, [])
        for asset in parser.assets - {'https://lab.bingo/'}:
            self.assertTrue(asset.startswith('/') and not asset.startswith('//'), asset)
            self.assertTrue((ROOT / 'web' / asset.lstrip('/')).is_file(), asset)
        css = (ROOT / 'web/style.css').read_text()
        for asset in re.findall(r'url\(["\']?([^\)"\']+)', css):
            self.assertTrue(asset.startswith('/fonts/'), asset)
            self.assertTrue((ROOT / 'web' / asset.lstrip('/')).is_file(), asset)
        self.assertIn('connect-src \'none\'', (ROOT / 'Caddyfile').read_text())
        self.assertEqual(len(list((ROOT / 'web/fonts').glob('*OFL.txt'))), 2)


@unittest.skipUnless(os.environ.get('HUB_TEST_URL'), 'HUB_TEST_URL enables local Caddy integration checks')
class CaddyTests(unittest.TestCase):
    def setUp(self):
        self.base = os.environ['HUB_TEST_URL'].rstrip('/')
        if urlsplit(self.base).hostname not in {'127.0.0.1', 'localhost'}:
            self.fail('Integration checks must target a local fixture, not production')

    def test_real_server_serves_the_site_assets_and_security_headers(self):
        with urlopen(self.base + '/healthz', timeout=5) as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(response.read(), b'ok')
        with urlopen(self.base + '/', timeout=5) as response:
            self.assertEqual(response.status, 200)
            self.assertIn('Le lab de Corentin', response.read().decode())
            self.assertIn("connect-src 'none'", response.headers['Content-Security-Policy'])
            self.assertIn("frame-ancestors 'none'", response.headers['Content-Security-Policy'])
            self.assertEqual(response.headers['X-Frame-Options'], 'DENY')
            self.assertEqual(response.headers['X-Content-Type-Options'], 'nosniff')
        for asset in catalogue().assets - {'https://lab.bingo/'}:
            with urlopen(self.base + asset, timeout=5) as response:
                self.assertEqual(response.status, 200)
        for font in (ROOT / 'web/fonts').iterdir():
            with urlopen(self.base + '/fonts/' + font.name, timeout=5) as response:
                self.assertEqual(response.status, 200)

    def test_unknown_paths_return_404(self):
        with self.assertRaises(HTTPError) as failure:
            urlopen(self.base + '/this-service-does-not-exist', timeout=5)
        self.assertEqual(failure.exception.code, 404)


if __name__ == '__main__':
    unittest.main()
