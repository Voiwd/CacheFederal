"""Build reproducible CEAP snapshots from the official annual CSVs."""
import base64, collections, csv, datetime, gzip, hashlib, io, json, pathlib, urllib.request, zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
output = ROOT / '.data'
output.mkdir(exist_ok=True)
manifest = {'fetchedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'years': {}}
for year in (2025, 2026):
    url = f'https://www.camara.leg.br/cotas/Ano-{year}.csv.zip'
    archive = urllib.request.urlopen(url, timeout=90).read()
    groups = collections.defaultdict(list)
    with zipfile.ZipFile(io.BytesIO(archive)) as z:
        rows = csv.DictReader(io.TextIOWrapper(z.open(z.namelist()[0]), encoding='utf-8-sig'), delimiter=';')
        for index, r in enumerate(rows):
            deputy = r.get('ideCadastro', '')
            if not deputy.isdigit(): continue
            def number(key): return float((r.get(key) or '0').replace(',', '.'))
            groups[deputy].append({
                'id': f'{year}-{index}', 'date': r['datEmissao'] or None,
                'year': year, 'month': int(r['numMes']),
                'category': r['txtDescricao'], 'supplier': r['txtFornecedor'],
                'documentNumber': r['txtNumero'], 'documentUrl': r['urlDocumento'] or None,
                'value': number('vlrDocumento'), 'glosa': number('vlrGlosa'),
                'netValue': number('vlrLiquido'), 'restitution': number('vlrRestituicao'),
                'sourceMode': 'official',
            })
    for deputy, rows in groups.items():
        rows.sort(key=lambda r: (r['month'], r['date'] or ''), reverse=True)
        # Positional rows keep the embedded Worker artifact within its size limit.
        columns = ['date', 'month', 'category', 'supplier', 'documentUrl', 'value', 'glosa', 'netValue', 'restitution']
        payload = {'columns': columns, 'rows': [[r[k] for k in columns] for r in rows], 'sourceUrl': url, 'fetchedAt': manifest['fetchedAt'], 'complete': True}
        blob = gzip.compress(json.dumps(payload, ensure_ascii=False, separators=(',', ':')).encode(), mtime=0)
        (output / f'ceap-{year}-{deputy}.json.gz').write_bytes(blob)
    manifest['years'][str(year)] = {'sourceUrl': url, 'sha256': hashlib.sha256(archive).hexdigest(), 'deputies': len(groups), 'rows': sum(map(len, groups.values()))}
    print(year, manifest['years'][str(year)], flush=True)
(output / 'ceap-manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
(ROOT / 'public' / 'ceap-available.json').write_text(json.dumps({str(year): [p.name.split('-')[2].split('.')[0] for p in output.glob(f'ceap-{year}-*.json.gz')] for year in (2025,2026)}), encoding='utf-8')
print('Compressed bytes:', sum(p.stat().st_size for p in output.glob('*.gz')), flush=True)
