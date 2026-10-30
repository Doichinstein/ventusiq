// Verify emitted assets and both public HTML delivery paths after npm run build.
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {moduleScripts} from './build-dashboard.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=path=>readFile(resolve(root,path),'utf8');
const report=JSON.parse(await read('.sites-runtime/dashboard/report.json'));
const original=await read('public/index.html'),optimized=await read('.sites-runtime/dashboard/index.html');
const tags=[...optimized.matchAll(/<script[^>]*><\/script>/g)].map(m=>m[0]);
if(moduleScripts(original).length!==report.module_entries || tags.filter(t=>t.includes('type="module"')).length!==1 ||
    !optimized.includes(`src="${report.asset}"`) || !report.modules.every(m=>m.path.startsWith('public/')))
  throw Error('Optimized HTML does not represent the complete feature entry graph');
const classic=html=>[...html.matchAll(/<script defer[^>]*><\/script>/g)].map(m=>m[0]);
if(JSON.stringify(classic(original))!==JSON.stringify(classic(optimized)))throw Error('Classic script order changed');
if(await read('dist/client/index.html')!==optimized)throw Error('Static index was not optimized');
const body=await readFile(resolve(root,'dist/client',report.asset.slice(1)));
if(createHash('sha256').update(body).digest('hex')!==report.sha256)throw Error('Built feature asset differs from its hash');
let embedded=false;
async function inspect(folder){
  for(const entry of await readdir(folder,{withFileTypes:true})){
    const path=resolve(folder,entry.name);
    if(entry.isDirectory())await inspect(path);
    else if(entry.isFile()&&entry.name.endsWith('.js')&&(await readFile(path,'utf8')).includes(report.asset))embedded=true;
  }
}
await inspect(resolve(root,'dist/server'));
if(!embedded)throw Error('Worker route does not embed the optimized feature asset URL');
console.log(JSON.stringify({status:'passed',module_entries:report.module_entries,source_module_requests:report.source_module_requests,
  bundled_module_requests:1,source_gzip_bytes:report.source_gzip_bytes,bundle_gzip_bytes:report.bundle_gzip_bytes,
  static_and_worker_html:'verified',content_hash:report.sha256},null,2));
