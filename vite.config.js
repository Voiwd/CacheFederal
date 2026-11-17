import {defineConfig} from 'vite'
import {auditResponse} from './worker/audit.js'
import {readFileSync,existsSync} from 'node:fs'
export default defineConfig({plugins:[{name:'audit-api',configureServer(server){server.middlewares.use(async(req,res,next)=>{
 if(req.url.startsWith('/api/audit/')){try{const r=await auditResponse(new Request('http://localhost'+req.url));res.statusCode=r.status;res.setHeader('Content-Type','application/json');res.end(await r.text())}catch(e){res.statusCode=502;res.end(JSON.stringify({error:e.message}))}return}
 const name=req.url.split('?')[0].replace('/api/','')
 if(req.url.startsWith('/api/ceap-')&&/^[\w.-]+\.json$/.test(name)){if(existsSync('.data/'+name+'.gz')){res.setHeader('Content-Type','application/json');res.setHeader('Content-Encoding','gzip');res.end(readFileSync('.data/'+name+'.gz'))}else{res.statusCode=404;res.end(JSON.stringify({error:'Sem registros CEAP neste arquivo'}))}return}
 next()
})}}]})
