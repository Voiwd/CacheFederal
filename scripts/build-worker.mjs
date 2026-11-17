import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import path from 'node:path'
const assets = {}
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon'}
function add(dir, prefix='') { for (const name of readdirSync(dir)) {
  const full=path.join(dir,name), key=prefix+'/'+name
  if(statSync(full).isDirectory()) add(full,key)
  else if(!key.includes('.openai')&&!key.includes('original')) assets[key]=[types[path.extname(name)]||'application/octet-stream',gzipSync(readFileSync(full)).toString('base64')]
}}
add('dist')
for(const name of readdirSync('.data')) if(name.endsWith('.json.gz')) assets['/api/'+name.replace('.gz','')]=['application/json; charset=utf-8',readFileSync(path.join('.data',name)).toString('base64')]
assets['/api/ceap-manifest.json']=['application/json',gzipSync(readFileSync('.data/ceap-manifest.json')).toString('base64')]
const audit=readFileSync('worker/audit.js','utf8').replaceAll('export ','')
const source=`${audit}\nconst assets=${JSON.stringify(assets)};\nexport default {async fetch(request,env,ctx){const url=new URL(request.url);if(url.pathname.startsWith('/api/audit/'))return auditResponse(request,ctx);const asset=assets[url.pathname==='/'?'/index.html':url.pathname];if(!asset)return new Response('Not found',{status:404});const bytes=Uint8Array.from(atob(asset[1]),c=>c.charCodeAt(0));return new Response(bytes,{headers:{'Content-Type':asset[0],'Content-Encoding':'gzip','Cache-Control':url.pathname.startsWith('/assets/')?'public,max-age=31536000,immutable':'public,max-age=300'}})}};`
mkdirSync('dist/server',{recursive:true})
writeFileSync('dist/server/index.js',source)
mkdirSync('dist/.openai',{recursive:true})
writeFileSync('dist/.openai/hosting.json',readFileSync('.openai/hosting.json'))
console.log('Worker gzip size:',gzipSync(source).length,'bytes')
