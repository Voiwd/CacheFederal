"""Import official annual SIAPE payroll and SCDP travel, without an API key.

Raw ZIPs and selected intermediate records stay in ignored .data/federal.
Only validated aggregates and public travel references are shipped to the site.
"""
import argparse
import csv
import hashlib
import io
import json
import subprocess
import unicodedata
import zipfile
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
import requests

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.data' / 'federal'
PORTAL = 'https://portaldatransparencia.gov.br'


def norm(text):
    return ''.join(c for c in unicodedata.normalize('NFD', text.upper().strip()) if not unicodedata.combining(c))


def cents(text):
    if not isinstance(text, str) or not text.strip():
        raise ValueError('Valor ausente')
    value = Decimal(text.replace('.', '').replace(',', '.'))
    if not value.is_finite() or value * 100 != (value * 100).to_integral_value():
        raise ValueError('Valor inválido')
    return int(value * 100)


def profiles():
    code = "import {NAMED_DIRECTORY} from './worker/political-profiles.js';import {ADDITIONAL_PROFILES} from './worker/additional-profiles.js';console.log(JSON.stringify([...NAMED_DIRECTORY.profiles,...ADDITIONAL_PROFILES].filter(p=>['president','minister'].includes(p.role))))"
    return json.loads(subprocess.check_output(['node', '--input-type=module', '-e', code], cwd=ROOT, encoding='utf-8'))


def download(url, path, refresh=False):
    if not refresh and path.exists() and zipfile.is_zipfile(path):
        return path
    response = requests.get(url, stream=True, timeout=(20, 120))
    response.raise_for_status()
    if 'zip' not in response.headers.get('Content-Type', ''):
        raise ValueError('A fonte não retornou um ZIP: ' + url)
    temp = path.with_suffix('.part')
    with temp.open('wb') as output:
        for chunk in response.iter_content(1024 * 1024):
            output.write(chunk)
    if not zipfile.is_zipfile(temp):
        raise ValueError('ZIP inválido: ' + url)
    temp.replace(path)
    return path


def records(archive, filename):
    with archive.open(filename) as source:
        # ISO-8859-1 preserves every source byte, including controls found in
        # unrelated SIAPE descriptions; never replace characters in identities.
        yield from csv.DictReader(io.TextIOWrapper(source, encoding='latin1'), delimiter=';')


def extract_month(year, month, names, refresh=False):
    key = f'{year}{month:02}'
    cached = CACHE / f'{key}-selected.json'
    fingerprint = hashlib.sha256('\n'.join(sorted(names)).encode('utf-8')).hexdigest()
    if cached.exists() and not refresh:
        previous = json.loads(cached.read_text(encoding='utf-8'))
        if previous.get('namesFingerprint') == fingerprint:
            return previous
    path = download(f'{PORTAL}/download-de-dados/servidores/{key}_Servidores_SIAPE', CACHE / f'{key}_Servidores_SIAPE.zip', refresh)
    result = {'month': month, 'namesFingerprint': fingerprint, 'registry': [], 'payroll': [], 'observations': []}
    with zipfile.ZipFile(path) as archive:
        for suffix, target in [('Cadastro', 'registry'), ('Remuneracao', 'payroll'), ('Observacoes', 'observations')]:
            for row in records(archive, f'{key}_{suffix}.csv'):
                if norm(row['NOME']) in names:
                    result[target].append(row)
    cached.write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')
    print(f'SIAPE {key}: {len(result["payroll"])} registros selecionados', flush=True)
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--year', type=int, default=2025)
    parser.add_argument('--extract-only', action='store_true')
    parser.add_argument('--refresh', action='store_true', help='Baixar novamente as fontes, inclusive arquivos em cache')
    args = parser.parse_args()
    if args.year >= datetime.now().year:
        raise ValueError('Use apenas exercícios encerrados')
    CACHE.mkdir(parents=True, exist_ok=True)
    people = profiles()
    names = {norm(p['fullName']) for p in people}
    with ThreadPoolExecutor(max_workers=3) as executor:
        months = list(executor.map(lambda m: extract_month(args.year, m, names, args.refresh), range(1, 13)))
    if not args.extract_only:
        build(args.year, people, months, args.refresh)


def build(year, people, months, refresh=False):
    if sorted(m['month'] for m in months) != list(range(1, 13)):
        raise ValueError('São necessários os 12 arquivos mensais')
    travel_path = download(f'{PORTAL}/download-de-dados/viagens/{year}', CACHE / f'viagens-{year}.zip', refresh)
    names = {norm(p['fullName']) for p in people}
    travels = defaultdict(list)
    with zipfile.ZipFile(travel_path) as archive:
        for row in records(archive, f'{year}_Viagem.csv'):
            if norm(row['Nome']) in names:
                travels[norm(row['Nome'])].append(row)
    output = {'year': year, 'profiles': {}, 'excludedProfiles': {}}
    fetched_at = datetime.now(timezone.utc).isoformat()
    for person in people:
        name = norm(person['fullName'])
        if person.get('termStart') and not int(person['termStart'][:4]) <= year <= int(person['termEnd'][:4]):
            continue
        monthly_registry = {}
        problems = []
        for data in months:
            matching = [r for r in data['registry'] if norm(r['NOME']) == name and office_matches(person, r)]
            if len(matching) != 1:
                problems.append(f'Cargo individual não confirmado em {data["month"]}/{year}.')
            else:
                monthly_registry[data['month']] = matching[0]
        if len(monthly_registry) != 12 or len({r['Id_SERVIDOR_PORTAL'] for r in monthly_registry.values()}) != 1:
            output['excludedProfiles'][person['id']] = 'O cadastro mensal não confirma este cargo durante os 12 meses do ano. Não atribuímos salário anual ou despesas de outros cargos.'
            continue
        components = []
        try:
            salary_rows, allowance_rows = [], []
            for data in months:
                month = data['month']
                registry = monthly_registry[month]
                server_id = registry['Id_SERVIDOR_PORTAL']
                # Payroll is aggregated by person, not by job. Multiple concurrent
                # positions cannot safely be assigned to the ministerial role.
                positions = [r for r in data['registry'] if r['Id_SERVIDOR_PORTAL'] == server_id]
                if len(positions) != 1:
                    raise ValueError('Folha com mais de um vínculo; remuneração não atribuída integralmente ao cargo.')
                paid = [r for r in data['payroll'] if r['Id_SERVIDOR_PORTAL'] == server_id and norm(r['NOME']) == name]
                if len(paid) != 1:
                    raise ValueError('Folha mensal ausente ou ambígua.')
                row = paid[0]
                if int(row['ANO']) != year or int(row['MES']) != month or row['CPF'] != registry['CPF']:
                    raise ValueError('Identificação ou competência da folha divergente.')
                gross, allowances = reconcile_payroll(row)
                source = f'{PORTAL}/download-de-dados/servidores/{year}{month:02}_Servidores_SIAPE'
                common = {'date': f'{year}-{month:02}-01', 'month': month, 'sourceUrl': source, 'supplier': person['fullName']}
                salary_rows.append({**common, 'id': f'federal-salary-{year}-{month}', 'category': 'Salário, 13º e férias', 'value': gross / 100})
                allowance_rows.append({**common, 'id': f'federal-allowance-{year}-{month}', 'category': 'Auxílios e indenizações', 'value': allowances / 100})
            for kind, label, rows in [('remuneration', 'Salário, 13º e férias publicados', salary_rows), ('allowances', 'Auxílios e indenizações da folha', allowance_rows)]:
                components.append(component(kind, label, rows, f'{PORTAL}/download-de-dados/servidores',
                    '12 folhas mensais SIAPE conferidas por identificador, nome, cargo e competência. Valores brutos após abate-teto; impostos não reduzem o custo. Não inclui vínculos ou pagamentos fora do SIAPE. A folha substitui o salário tabelado, sem somá-lo novamente.'))
        except ValueError as error:
            problems.append(str(error) + ' Mantido o salário da tabela.')
        try:
            rows = reconcile_travel(travels.get(name, []), person, year, monthly_registry)
            if rows:
                components.append(component('extraExpenses', 'Viagens a serviço', rows, f'{PORTAL}/download-de-dados/viagens/{year}',
                    'Arquivo anual SCDP lido integralmente. Beneficiário conferido por nome e CPF mascarado com o cadastro SIAPE do mês, com cargo confirmado. Diárias, passagens e outros gastos menos devoluções, uma vez por processo. Não inclui voos da FAB, comitivas ou gastos sigilosos ausentes nesta fonte.'))
            else:
                problems.append('Nenhuma viagem individual identificada no SCDP; isso não significa custo zero com deslocamentos.')
        except ValueError as error:
            problems.append('Viagens não somadas: ' + str(error))
        if person['role'] == 'president':
            problems.append('O cartão presidencial publicado agrega despesas de unidades da Presidência, sem identificar o beneficiário. Esses valores e os custos institucionais não são somados à pessoa.')
        notice = ' '.join(problems + ['A conta cobre os registros individuais publicados nas fontes integradas; não representa todo o custo do órgão.'])
        if components:
            output['profiles'][person['id']] = {'year': year, 'components': components, 'fetchedAt': fetched_at,
                'sourceUrl': f'{PORTAL}/download-de-dados/servidores', 'notice': notice,
                'verifiedMonths': list(range(1, 13)) if any(c['kind'] == 'remuneration' for c in components) else [],
                'officeMonths': list(range(1, 13))}
        else:
            output['excludedProfiles'][person['id']] = notice
    if not output['profiles']:
        raise ValueError('Nenhum perfil conciliado; snapshot anterior preservado')
    target = ROOT / 'worker' / 'federal-costs.js'
    snapshot = {'years': {}}
    if target.exists():
        previous = json.loads(target.read_text(encoding='utf-8').split('export const FEDERAL_COSTS = ', 1)[1])
        snapshot = previous if 'years' in previous else {'years': {str(previous['year']): previous}}
    snapshot['years'][str(year)] = output
    snapshot.get('sourceFailures', {}).pop(str(year), None)
    target.write_text('// Generated by scripts/refresh-federal-costs.py; official SIAPE/SCDP data.\nexport const FEDERAL_COSTS = ' + json.dumps(snapshot, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'Importados {len(output["profiles"])} perfis; {len(output["excludedProfiles"])} excluídos da conta anual.', flush=True)


def record_failure(year, message, source_url):
    """Record an observed source failure without publishing a partial year."""
    target = ROOT / 'worker' / 'federal-costs.js'
    snapshot = json.loads(target.read_text(encoding='utf-8').split('export const FEDERAL_COSTS = ', 1)[1]) if target.exists() else {'years': {}}
    snapshot.setdefault('sourceFailures', {})[str(year)] = {'notice': message, 'sourceUrl': source_url,
        'checkedAt': datetime.now(timezone.utc).isoformat()}
    target.write_text('// Generated by scripts/refresh-federal-costs.py; official SIAPE/SCDP data.\nexport const FEDERAL_COSTS = ' + json.dumps(snapshot, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')


def office_matches(person, row):
    return norm(row['DESCRICAO_CARGO']) == ('PRESIDENTE DA REPUBLICA' if person['role'] == 'president' else 'MINISTRO DE ESTADO')


def component(kind, label, rows, source, notice):
    return {'kind': kind, 'label': label, 'rows': rows, 'value': sum(round(r['value'] * 100) for r in rows) / 100,
            'status': 'available', 'sourceUrl': source, 'notice': notice}


def reconcile_payroll(row):
    money = {key: cents(value) for key, value in row.items() if '(R$)' in key or '(U$)' in key}
    if any(value for key, value in money.items() if '(U$)' in key):
        raise ValueError('Folha em moeda estrangeira não convertida')
    gross_keys = ['REMUNERAÇÃO BÁSICA BRUTA (R$)', 'ABATE-TETO (R$)', 'GRATIFICAÇÃO NATALINA (R$)',
                  'ABATE-TETO DA GRATIFICAÇÃO NATALINA (R$)', 'FÉRIAS (R$)', 'OUTRAS REMUNERAÇÕES EVENTUAIS (R$)']
    deduction_keys = ['IRRF (R$)', 'PSS/RPGS (R$)', 'DEMAIS DEDUÇÕES (R$)', 'PENSÃO MILITAR (R$)',
                      'FUNDO DE SAÚDE (R$)', 'TAXA DE OCUPAÇÃO IMÓVEL FUNCIONAL (R$)']
    gross = sum(money[k] for k in gross_keys)
    if gross + sum(money[k] for k in deduction_keys) != money['REMUNERAÇÃO APÓS DEDUÇÕES OBRIGATÓRIAS (R$)']:
        raise ValueError('Parcelas da folha não conferem com o líquido publicado')
    allowances = money['TOTAL DE VERBAS INDENIZATÓRIAS (R$)(*)']
    if sum(v for k, v in money.items() if k.startswith('VERBAS INDENIZATÓRIAS') and '(R$)' in k) != allowances:
        raise ValueError('Auxílios não conferem com o total publicado')
    return gross, allowances


def reconcile_travel(travels, person, year, monthly_registry):
    rows, seen = [], set()
    for trip in travels:
        start = datetime.strptime(trip['Período - Data de início'], '%d/%m/%Y')
        if start.year != year:
            raise ValueError('Viagem fora do exercício; período não conciliado')
        registry = monthly_registry[start.month]
        # Ignore travel in another job, not merely in another ministry.
        if person['role'] == 'minister' and trip['Função'] != 'CNE-0001':
            continue
        if person['role'] == 'president' and norm(trip['Cargo']) != 'PRESIDENTE DA REPUBLICA':
            continue
        if norm(trip['Nome']) != norm(person['fullName']) or trip['CPF viajante'] != registry['CPF']:
            raise ValueError('Beneficiário não coincide com o cadastro mensal')
        key = trip['Identificador do processo de viagem']
        if not key or key in seen:
            raise ValueError('Processo repetido ou sem identificador')
        seen.add(key)
        values = [cents(trip[k]) for k in ['Valor diárias', 'Valor passagens', 'Valor outros gastos', 'Valor devolução']]
        value = sum(values[:3]) - values[3]
        if not value:
            continue
        rows.append({'id': 'federal-trip-' + key, 'date': start.strftime('%Y-%m-%d'), 'category': 'Viagens a serviço',
                     'value': value / 100, 'supplier': person['fullName'], 'documentNumber': trip['Número da Proposta (PCDP)'],
                     'description': f'{trip["Destinos"]} · {trip["Situação"]}',
                     'sourceUrl': f'{PORTAL}/download-de-dados/viagens/{year}',
                     'breakdown': dict(zip(['dailyAllowances', 'tickets', 'other', 'refunds'], [v / 100 for v in values]))})
    return rows


if __name__ == '__main__':
    main()
