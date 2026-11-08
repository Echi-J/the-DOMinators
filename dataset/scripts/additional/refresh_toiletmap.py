"""Download the published Toilet Map export, validate in staging, then replace files."""
import argparse
import datetime as dt
import hashlib
import html
import json
import os
from pathlib import Path
import re
import shutil
import tempfile
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from clean_toiletmap import clean, PAGE


def download(url):
    request = Request(url, headers={'User-Agent': 'AccessLondonData/1.0', 'Accept': 'application/json,text/html'})
    with urlopen(request, timeout=45) as response:
        body = response.read(30_000_001)
        if len(body) > 30_000_000:
            raise ValueError('Unexpectedly large source response')
        return body


def refresh(output, cache, boundaries):
    stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    raw = cache/stamp
    raw.mkdir(parents=True, exist_ok=False)
    page = download(PAGE)
    (raw/'dataset.html').write_bytes(page)
    links = [html.unescape(u) for u in re.findall(r'href="([^"]+)"', page.decode())]
    urls = [u for u in links if '/exports/toilets-' in u and '.json?' in u]
    if len(urls) != 1 or not urlparse(urls[0]).hostname.endswith('.public.blob.vercel-storage.com'):
        raise ValueError('Provider download link changed; review before continuing')
    content = download(urls[0])
    (raw/'toilets.json').write_bytes(content)
    manifest = {'source_page': PAGE, 'url': urls[0],
                'retrieved_at': dt.datetime.now(dt.timezone.utc).isoformat(),
                'sha256': hashlib.sha256(content).hexdigest(), 'bytes': len(content)}
    (raw/'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
    with tempfile.TemporaryDirectory(prefix='access-london-toiletmap-') as folder:
        stage = Path(folder)
        clean(raw/'toilets.json', raw/'manifest.json', stage, boundaries, output/'Website')
        new = json.loads((stage/'Website/data/toiletmap/metadata.json').read_text())
        old_path = output/'Website/data/toiletmap/metadata.json'
        if old_path.exists():
            old = json.loads(old_path.read_text())
            if new['counts']['london_records'] < old['counts']['london_records'] * .9:
                raise ValueError('London record count fell by over 10%; review the staged source')
        for source in sorted(stage.rglob('*')):
            if source.is_file():
                target = output/source.relative_to(stage)
                target.parent.mkdir(parents=True, exist_ok=True)
                temporary = target.with_name(target.name+'.new')
                shutil.copyfile(source, temporary)
                os.replace(temporary, target)
    print('Published validated Toilet Map snapshot from '+str(raw))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-root', type=Path, required=True)
    parser.add_argument('--cache-dir', type=Path, required=True)
    parser.add_argument('--boundaries', type=Path, required=True)
    args = parser.parse_args()
    refresh(args.output_root.resolve(), args.cache_dir.resolve(), args.boundaries.resolve())
