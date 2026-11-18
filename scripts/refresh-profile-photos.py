"""Attach TSE photos by candidacy ID; cache verified 2022 portraits locally.
2024 follows the TSE photo URL documentation (no name-based image matching).
Run after refresh-political-profiles.py to preserve photo enrichment.
"""
import io
import csv
import tempfile
import unicodedata
import json
import zipfile
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import requests

ROOT = Path(__file__).resolve().parents[1]

class RemoteZip(io.RawIOBase):
    def __init__(self,url):
        self.url=url
        self.pos=0
        self.cache={}
        r=requests.get(url,headers={'Range':'bytes=-65536'},timeout=45)
        r.raise_for_status()
        self.size=int(r.headers['Content-Range'].split('/')[-1])
        self.tail=r.content
        self.tail_start=self.size-len(self.tail)
    def seek(self,offset,whence=0):
        self.pos=offset if whence==0 else self.pos+offset if whence==1 else self.size+offset
        return self.pos
    def tell(self): return self.pos
    def read(self,n=-1):
        end=self.size if n<0 else min(self.size,self.pos+n)
        start=self.pos
        if start>=self.tail_start: data=self.tail[start-self.tail_start:end-self.tail_start]
        elif (start,end) in self.cache: data=self.cache[start,end]
        else:
            r=requests.get(self.url,headers={'Range':f'bytes={start}-{end-1}'},timeout=45)
            r.raise_for_status()
            if r.status_code!=206: raise ValueError('Server ignored range request')
            data=r.content
            self.cache[start,end]=data
        self.pos=end
        return data

def enrich_2022(p):
    seq=p['id'].split('-')[-1]
    uf='BR' if p['role']=='president' else p['state']
    url=f'https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2022/fotos/foto_cand2022_{uf}_div.zip'
    try:
        with zipfile.ZipFile(RemoteZip(url)) as archive:
            matches=[n for n in archive.namelist() if seq in n and n.lower().endswith(('.jpg','.jpeg','.png'))]
            if len(matches)!=1: return p['id'],'No unique photo'
            content=archive.read(matches[0])
            if not content.startswith((b'\xff\xd8',b'\x89PNG')): raise ValueError('Invalid image')
            filename=f'tse-{seq}'+Path(matches[0]).suffix.lower()
            (ROOT/'public'/'portraits'/filename).write_bytes(content)
            p.update(photo=f'/portraits/{filename}',photoSource=url,photoCredit='TSE · eleição de 2022')
            return p['id'],'ok'
    except Exception as error: return p['id'],str(error)

def main():
    path=ROOT/'worker'/'political-profiles.js'
    text=path.read_text(encoding='utf-8')
    data=json.loads(text[text.index('{'):])
    for p in data['profiles']:
        if p.get('electionYear') == 2024:
            seq=p['id'].split('-')[-1]
            p.update(photo=f"https://resultados.tse.jus.br/oficial/ele2024/619/fotos/{p['state'].lower()}/{seq}.jpeg",photoCredit='TSE · eleição de 2024')
            p['photoSource']=p['photo']
    # Exact full-name matches only: reuse historical candidacy portraits for ministers.
    cached=Path(tempfile.gettempdir())/'cache-federal-official-directory'/'tse-2022.zip'
    normalize=lambda value: ''.join(c for c in unicodedata.normalize('NFD',value).upper() if not unicodedata.combining(c)).strip()
    ministers={normalize(p['fullName']):p for p in data['profiles'] if p['role']=='minister' and not p.get('photo')}
    matches={}
    if cached.exists():
        with zipfile.ZipFile(cached) as archive:
            for name in archive.namelist():
                if not name.endswith('.csv') or name.endswith('_BRASIL.csv'): continue
                with archive.open(name) as raw:
                    for row in csv.DictReader(io.TextIOWrapper(raw,encoding='latin1'),delimiter=';'):
                        key=normalize(row['NM_CANDIDATO'])
                        if key in ministers: matches.setdefault(key,{})[row['SQ_CANDIDATO']]=row
        for key,found in matches.items():
            if len(found)!=1: continue
            row=next(iter(found.values()))
            candidate={'id':'tse-2022-'+row['SQ_CANDIDATO'],'state':row['SG_UF'],'role':'candidate'}
            result=enrich_2022(candidate)
            print(ministers[key]['name'],result[1])
            if candidate.get('photo'):
                ministers[key].update({k:candidate[k] for k in ('photo','photoSource','photoCredit')})
    candidates=[p for p in data['profiles'] if p.get('electionYear')==2022 and not p.get('photo')]
    for result in ThreadPoolExecutor(max_workers=4).map(enrich_2022,candidates): print(*result)
    path.write_text(text[:text.index('{')]+json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')

if __name__=='__main__': main()
