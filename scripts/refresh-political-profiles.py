"""Rebuild the searchable named directory from TSE, IBGE and Planalto.

Only election winners from ordinary elections are imported. This is an electoral
snapshot, not proof that a person still holds office. No CPF, birthdate or email
is retained. Downloads remain in .data and are never embedded in the website.
"""
import csv
import argparse
import html
import io
import json
import re
import tempfile
import unicodedata
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
DATA = Path(tempfile.gettempdir()) / 'cache-federal-official-directory'
DATA.mkdir(exist_ok=True)
SESSION = requests.Session()
SESSION.headers['User-Agent'] = 'CacheFederal/1.0 official-public-data-directory'
parser = argparse.ArgumentParser()
parser.add_argument('--cached', action='store_true', help='Reuse previously downloaded TSE archives for development only')
args = parser.parse_args()

def get(url):
    r = SESSION.get(url, timeout=90)
    r.raise_for_status()
    return r

def fold(value):
    return ''.join(c for c in unicodedata.normalize('NFD', value) if not unicodedata.combining(c)).upper().strip()

def clean(value):
    return html.unescape(re.sub('<[^>]+>', '', value)).strip().replace('\xa0', ' ')

municipalities = get('https://servicodados.ibge.gov.br/api/v1/localidades/municipios').json()
states = get('https://servicodados.ibge.gov.br/api/v1/localidades/estados').json()
state_map = {s['sigla']: s for s in states}
city_map = {}
for c in municipalities:
    uf = (((c.get('microrregiao') or {}).get('mesorregiao') or {}).get('UF') or c['regiao-imediata']['regiao-intermediaria']['UF'])['sigla']
    city_map[(uf, fold(c['nome']))] = c

profiles = {}
unmatched = []
for year in (2022, 2024):
    source = f'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_{year}.zip'
    archive = DATA / f'tse-{year}.zip'
    if not args.cached or not archive.exists():
        archive.write_bytes(get(source).content)
    with zipfile.ZipFile(archive) as z:
        rows = csv.DictReader(io.TextIOWrapper(z.open(f'consulta_cand_{year}_BRASIL.csv'), encoding='latin1'), delimiter=';')
        for row in rows:
            role = {'1':'president','3':'governor','11':'mayor'}.get(row['CD_CARGO'])
            if not role or (year == 2024) != (role == 'mayor') or row['CD_TIPO_ELEICAO'] != '2' or row['CD_SIT_TOT_TURNO'] != '1':
                continue
            uf = row['SG_UF']
            city = city_map.get((uf, fold(row['NM_UE']))) if role == 'mayor' else None
            if role == 'mayor' and city is None:
                unmatched.append([row['NM_UE'], uf])
            id = f"tse-{year}-{row['SQ_CANDIDATO']}"
            start, end = ('2025-01-01','2028-12-31') if role == 'mayor' else ('2023-01-01','2026-12-31')
            profile = dict(id=id, name=row['NM_URNA_CANDIDATO'], fullName=row['NM_CANDIDATO'], titleholder=row['NM_CANDIDATO'], role=role, party=row['SG_PARTIDO'], state=uf, photo=None, scope='administration', sourceMode='official', officialUrl=f'https://dadosabertos.tse.jus.br/dataset/candidatos-{year}', sourceDownload=source, electionYear=year, electionDate=row['DT_ELEICAO'], sourceDate=row['DT_GERACAO'], termStart=start, termEnd=end, sourceNotice=f'Eleito na eleição ordinária de {year}, conforme resultado do TSE extraído em {row["DT_GERACAO"]}. Registro eleitoral histórico; não confirma ocupação atual nem afastamentos/substituições. Partido da candidatura.')
            if role == 'mayor':
                profile.update(city=(city or {}).get('nome', row['NM_UE']), ibgeId=str(city['id']) if city else None, institutionalName=f"Prefeitura de {(city or {}).get('nome', row['NM_UE'])}")
            elif role == 'governor':
                profile.update(ibgeId=str(state_map[uf]['id']), institutionalName=f"Governo de {state_map[uf]['nome']}")
            else:
                profile.update(externalId='26', institutionalName='Presidência da República')
            profiles[id] = profile

minister_url = 'https://www.gov.br/planalto/pt-br/conheca-a-presidencia/ministros-e-ministras/'
text = get(minister_url).content.decode('utf8')
body = text.split('id="parent-fieldname-text"', 1)[1].split('</div>', 1)[0]
pairs = re.findall(r'<p[^>]*>\s*<strong>(.*?)</strong>\s*</p>\s*<p[^>]*>(.*?)</p>', body, re.S)
if len(pairs) < 30:
    raise ValueError('Planalto directory markup changed: aborting rather than publishing incomplete names')
orgs = get('https://api.siorg.gov.br/doc/orgao-entidade').json()['unidades']
today = datetime.now(timezone.utc).date().isoformat()
for title_html, name_html in pairs:
    title, name = clean(title_html), clean(name_html)
    # Strip the office prefix; then find the exact official organizational name.
    suffix = re.sub(r'^Ministr[oa] de Estado(?: Chefe)? (?:da |do |das |dos |de )?', '', title, flags=re.I)
    candidates = [p for p in orgs if p['codigoEsfera'].endswith('/1') and p['codigoPoder'].endswith('/1') and (fold(p['nome']) == fold(title) or fold(p['nome']) == fold(suffix) or fold(p['nome']) == fold('Ministério '+re.sub(r'^Ministr[oa] de Estado ', '', title, flags=re.I)))]
    org = candidates[0] if len(candidates) == 1 else None
    external_id = org['codigoUnidade'].rsplit('/',1)[-1] if org else None
    id = 'minister-' + (external_id or re.sub('[^a-z0-9]+','-',fold(name).lower()).strip('-'))
    profiles[id] = dict(id=id, name=name, fullName=name, titleholder=name, role='minister', state='BR', party=None, photo=None, scope='administration', institutionalName=org['nome'] if org else title, externalId=external_id, officeTitle=title, sourceMode='official', officialUrl=minister_url, sourceDate=today, sourceNotice=f'Nome publicado no diretório de ministros do Planalto, consultado em {today}. Não reconstitui a ocupação em anos anteriores.')

result = {'generatedAt':datetime.now(timezone.utc).isoformat(), 'counts':dict(Counter(p['role'] for p in profiles.values())), 'unmatchedMunicipalities':unmatched, 'profiles':list(profiles.values())}
target = ROOT / 'worker' / 'political-profiles.js'
target.write_text('// Generated by scripts/refresh-political-profiles.py. Public official sources; electoral temporal limits retained.\nexport const NAMED_DIRECTORY = '+json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n', encoding='utf8')
print(json.dumps({'counts':result['counts'],'unmatchedMunicipalities':unmatched,'ministerOrgMatches':sum(p['role']=='minister' and bool(p.get('externalId')) for p in profiles.values())},ensure_ascii=False))
