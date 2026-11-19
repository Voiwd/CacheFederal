"""Import complete STF annual payroll bundles; reject missing months and ambiguous cabinets.
Only aggregated minister/cabinet costs are persisted, without staff identities.
"""
import csv,io,json,unicodedata
from decimal import Decimal, InvalidOperation
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import requests

ROOT=Path(__file__).resolve().parents[1]
SOURCE='https://egesp-portal.stf.jus.br/transparencia/rendimento_folha'
IDENTITIES={
 'stf-edson-fachin':('57','LUIZ EDSON FACHIN'),
 'stf-gilmar-mendes':('44','GILMAR FERREIRA MENDES'),
 'stf-carmen-lucia':('50','CARMEN LUCIA ANTUNES ROCHA'),
 'stf-dias-toffoli':('52','JOSE ANTONIO DIAS TOFFOLI'),
 'stf-luiz-fux':('53','LUIZ FUX'),
 'stf-alexandre-de-moraes':('58','ALEXANDRE DE MORAES'),
 'stf-nunes-marques':('59','KASSIO NUNES MARQUES'),
 'stf-andre-mendonca':('60','ANDRE LUIZ DE ALMEIDA MENDONCA'),
 'stf-cristiano-zanin':('61','CRISTIANO ZANIN MARTINS'),
 'stf-flavio-dino':('62','FLAVIO DINO DE CASTRO E COSTA'),
}
GROSS='Remuneração Bruta após o teto constitucional somada com outras verbas'
def fold(value):return ''.join(c for c in unicodedata.normalize('NFD',value) if not unicodedata.combining(c)).strip().upper()
def cents(value):
 if not value or not value.strip(): raise ValueError('Missing payroll amount')
 n=Decimal(value)
 if not n.is_finite() or n*100!=(n*100).to_integral_value():raise ValueError('Invalid money precision')
 return int(n*100)
def parse_month(content,year,month):
 reader=csv.DictReader(io.StringIO(content.decode('utf-8-sig')))
 required={'Matrícula','Nome','Cargo Efetivo','Nome da Unidade','Situação Funcional',GROSS}
 if not required.issubset(set(reader.fieldnames or [])):raise ValueError('STF payroll columns changed')
 rows=list(reader)
 if not rows:raise ValueError('Empty monthly payroll')
 from collections import Counter
 exact=Counter(tuple(r.values()) for r in rows)
 result={}
 for profile,(registration,name) in IDENTITIES.items():
  matches=[r for r in rows if r['Matrícula']==registration and fold(r['Nome'])==name and r['Situação Funcional']=='MINISTRO' and r['Cargo Efetivo']=='MINISTRO']
  if not matches or any(exact[tuple(r.values())]!=1 for r in matches):continue
  if len(set(r['Nome da Unidade'] for r in matches))!=1:continue
  minister=matches[0];unit=minister['Nome da Unidade']
  # Presidency/vice-presidency units do not establish the complete individual cabinet.
  if not fold(unit).startswith(('GABINETE MINISTRO ','GABINETE MINISTRA ')):continue
  staff=[r for r in rows if r['Nome da Unidade']==unit and r['Matrícula']!=registration]
  if any(not r['Matrícula'] or exact[tuple(r.values())]!=1 for r in staff):continue
  if not staff or any('APOSENT' in fold(r['Situação Funcional']) or 'PENSION' in fold(r['Situação Funcional']) or r['Cargo Efetivo']=='MINISTRO' for r in staff):continue
  try:result[profile]={'salary':sum(cents(r[GROSS]) for r in matches),'cabinet':sum(cents(r[GROSS]) for r in staff),'staffCount':len(set(r['Matrícula'] for r in staff))}
  except (ValueError,InvalidOperation):continue
 return result

def fetch_month(pair):
 year,month=pair
 params={'q[ano_eq]':year,'q[mes_eq]':month,'tipo_relatorio':'CSV'}
 response=requests.get(SOURCE,params=params,timeout=60);response.raise_for_status()
 if 'text/csv' not in response.headers.get('content-type','') or f'{month}/{year}' not in response.headers.get('content-disposition',''):raise ValueError('Wrong payroll response period')
 result=parse_month(response.content,year,month)
 print(f'{year}-{month:02}: {len(result)} verified individual cabinets',flush=True)
 return month,result,response.url

def main():
 from datetime import datetime,timezone
 year=2025 # Closed, twelve-month period only; never annualize an incomplete current year.
 months=list(ThreadPoolExecutor(max_workers=3).map(fetch_month,[(year,m) for m in range(1,13)]))
 profiles={}
 for profile in IDENTITIES:
  if not all(profile in data for _,data,_ in months):continue
  components=[]
  for kind,key,label in [('remuneration','salary','Salário e benefícios pagos'),('cabinet','cabinet','Equipe do gabinete')]:
   rows=[{'id':f'stf-{profile}-{key}-{year}-{month:02}','date':None,'year':year,'month':month,'category':label,'value':data[profile][key]/100,'sourceUrl':url,'description':f'Folha de {month:02}/{year}'} for month,data,url in months]
   components.append({'kind':kind,'label':label,'value':sum(data[profile][key] for _,data,_ in months)/100,'status':'available','rows':rows,'sourceUrl':SOURCE,'notice':'Folha bruta publicada, já inclui benefícios e outras verbas em folha, somando todas as parcelas publicadas no mês. Os 12 meses foram conferidos; equipe pela lotação exata, sem contar novamente o ministro. Não inclui despesas comuns do Tribunal.'})
  profiles[profile]={'components':components,'year':year,'sourceUrl':SOURCE,'fetchedAt':datetime.now(timezone.utc).isoformat(),'notice':'Remuneração e equipe publicadas para os 12 meses de 2025. A folha substitui o salário tabelado; benefícios em folha não são somados novamente. Despesas comuns do Tribunal ficam fora desta conta.','verifiedMonths':list(range(1,13))}
 if not profiles:raise ValueError('No complete payroll bundles; existing snapshot preserved')
 snapshot={'year':year,'profiles':profiles,'excludedProfiles':[p for p in IDENTITIES if p not in profiles]}
 (ROOT/'worker'/'stf-payroll.js').write_text('// Generated by scripts/refresh-stf-payroll.py. Only complete annual bundles.\nexport const STF_PAYROLL = '+json.dumps(snapshot,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
 print('Complete profiles:',len(profiles),'Excluded:',snapshot['excludedProfiles'],flush=True)
if __name__=='__main__':main()
