// Bundle the existing feature graph without changing the buildless source edition.
import {readFile, writeFile, mkdir, readdir, unlink} from 'node:fs/promises';
import {resolve, relative, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {build} from 'vite';

const project = fileURLToPath(new URL('../', import.meta.url));
export function moduleScripts(html) {
  const matches = [...html.matchAll(/<script\s+type="module"\s+src="(\/[a-z0-9-]+\.(?:js|mjs))"><\/script>/g)];
  if (!matches.length || matches.length !== (html.match(/<script\s+type="module"/g)||[]).length)
    throw Error('Dashboard module tags changed; review the bundling contract');
  if (new Set(matches.map(m=>m[1])).size !== matches.length) throw Error('Duplicate dashboard module entry');
  return matches;
}

export async function buildDashboard(root=project) {
  root=resolve(root);
  const html=await readFile(resolve(root,'public/index.html'),'utf8'), tags=moduleScripts(html);
  const work=resolve(root,'.sites-runtime/dashboard'), assets=resolve(root,'public/generated/dashboard');
  await mkdir(work,{recursive:true}); await mkdir(assets,{recursive:true});
  const entry=resolve(work,'entry.mjs');
  await writeFile(entry,tags.map(m=>'import '+JSON.stringify(resolve(root,'public'+m[1]).split(sep).join('/'))+';').join('\n')+'\n');
  const built=await build({configFile:false,root,publicDir:false,logLevel:'warn',
    build:{write:false,minify:true,sourcemap:false,lib:{entry,formats:['es']}}});
  const output=(Array.isArray(built)?built:[built]).flatMap(result=>result.output);
  if(output.length!==1 || output[0].type!=='chunk' || output[0].imports.length || output[0].dynamicImports.length)
    throw Error('Feature bundle needs exactly one self-contained JavaScript chunk');
  const chunk=output[0], hash=createHash('sha256').update(chunk.code).digest('hex'), name='features-'+hash.slice(0,16)+'.js';
  const sources=Object.keys(chunk.modules).filter(id=>!id.startsWith('\0') && resolve(id)!==entry);
  const rows=[];
  for(const id of sources) {
    const path=resolve(id), local=relative(resolve(root,'public'),path);
    if(local.startsWith('..') || local.includes(':')) throw Error('Unexpected dependency outside public feature sources');
    const raw=await readFile(path);
    rows.push({path:'public/'+local.split(sep).join('/'),bytes:raw.length,gzip_bytes:gzipSync(raw).length});
  }
  for(const tag of tags) if(!rows.some(row=>row.path==='public'+tag[1])) throw Error('Feature entry missing from bundle: '+tag[1]);
  const optimized=html.replace(tags[0][0],`<script type="module" src="/generated/dashboard/${name}"></script>`);
  let result=optimized;
  for(const tag of tags.slice(1)) result=result.replace(tag[0],'');
  const report={module_entries:tags.length,source_module_requests:rows.length,bundled_module_requests:1,
    source_bytes:rows.reduce((n,r)=>n+r.bytes,0),source_gzip_bytes:rows.reduce((n,r)=>n+r.gzip_bytes,0),
    bundle_bytes:Buffer.byteLength(chunk.code),bundle_gzip_bytes:gzipSync(chunk.code).length,sha256:hash,
    asset:'/generated/dashboard/'+name,modules:rows.sort((a,b)=>a.path.localeCompare(b.path))};
  await writeFile(resolve(assets,name),chunk.code);
  await writeFile(resolve(work,'index.html'),result);
  await writeFile(resolve(work,'report.json'),JSON.stringify(report,null,2)+'\n');
  // Only remove older files owned by this generator, never other public assets.
  for(const old of await readdir(assets,{withFileTypes:true}))
    if(old.isFile() && /^features-[0-9a-f]{16}\.js$/.test(old.name) && old.name!==name) await unlink(resolve(assets,old.name));
  console.log(`Dashboard features: ${rows.length} source-module requests → 1 bundle; gzip ${report.source_gzip_bytes} → ${report.bundle_gzip_bytes} bytes`);
  return report;
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) await buildDashboard();
