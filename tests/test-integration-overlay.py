"""Verify release overlay keeps an existing checkout's primary dashboard untouched."""
from pathlib import Path
import tempfile, subprocess, json
ROOT=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='trafficgen-overlay-check-') as tmp:
 root=Path(tmp);source=root/'source';out=root/'merged';source.mkdir();(source/'.git').mkdir()
 (source/'package.json').write_text(json.dumps({'name':'trafficgen','type':'module','scripts':{'test':'node --test tests/legacy.test.mjs'},'dependencies':{}}))
 (source/'index.html').write_text('<main>Original production dashboard</main>')
 (source/'app.js').write_text('// original dashboard remains')
 (source/'tests').mkdir();(source/'tests/legacy.test.mjs').write_text('')
 subprocess.run(['python',str(ROOT/'scripts/integrate-local-release.py'),str(source),str(out)],check=True,capture_output=True)
 assert (out/'index.html').read_text()=='<main>Original production dashboard</main>'
 assert (out/'app.js').read_text()=='// original dashboard remains'
 assert (out/'command-center/index.html').is_file()
 assert (out/'api/campaign-gateway.js').is_file()
 p=json.loads((out/'package.json').read_text())
 assert p['scripts']['test']=='node --test tests/legacy.test.mjs'
 assert 'test:campaign' in p['scripts']
 assert (out/'tests/legacy.test.mjs').is_file()
 print('PASS: isolated merge preserves production dashboard, original tests, new modules')
