"""Package the exact published datasets and ranking inputs without raw payroll files."""
import hashlib
import json
from pathlib import Path
import sys
import zipfile

root = Path(__file__).resolve().parents[1]
destination = Path(sys.argv[1]).resolve()
if destination.is_relative_to(root):
    raise SystemExit('Choose an archive destination outside the source checkout.')
files = set((root / '.data').glob('ceap-*'))
files.update((root / '.data/ranking').glob('*.json'))
files.update((root / 'worker').glob('*.js'))
files.update((root / 'public').rglob('*'))
files.update((root / 'src/data').glob('*.js'))
files.update((root / 'scripts').glob('refresh-*'))
files.update([root / 'README.md', root / 'LICENSE'])
files = sorted(p for p in files if p.is_file())
manifest = {
    'description': 'Snapshots, cadastros, agregados conciliados, entradas do ranking, imagens, fontes e scripts de coleta do Cachê Federal.',
    'rawPayrollArchivesIncluded': False,
    'files': [dict(path=p.relative_to(root).as_posix(), bytes=p.stat().st_size,
                   sha256=hashlib.sha256(p.read_bytes()).hexdigest()) for p in files],
}
destination.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for p in files:
        archive.write(p, p.relative_to(root).as_posix())
    archive.writestr('manifest.json', json.dumps(manifest, ensure_ascii=False, indent=2))
with zipfile.ZipFile(destination) as archive:
    if archive.testzip() is not None:
        raise SystemExit('Archive integrity check failed.')
print(json.dumps(dict(archive=str(destination), files=len(files), bytes=destination.stat().st_size,
                      sha256=hashlib.sha256(destination.read_bytes()).hexdigest())))
