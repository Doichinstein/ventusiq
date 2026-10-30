import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative} from 'node:path';
import vm from 'node:vm';
import {buildDashboard,moduleScripts} from '../scripts/build-dashboard.mjs';
import {dashboardBundle} from '../scripts/vite/dashboard-bundle.mjs';

test('one bundle preserves shared dependency identity, entry order and classic script markup',async()=>{
  const root=await mkdtemp(join(tmpdir(),'ventusiq-dashboard-'));
  try{
    await mkdir(join(root,'public'));
    const html='<script defer src="/core.js"></script>\n<script type="module" src="/one.js"></script>\n<script type="module" src="/two.mjs"></script><main>Weather</main>';
    await writeFile(join(root,'public/index.html'),html);
    await writeFile(join(root,'public/shared.mjs'),'window.calls.push("shared"); export const state={count:0};');
    await writeFile(join(root,'public/one.js'),'import {state} from "./shared.mjs"; window.calls.push("one:"+(++state.count));');
    await writeFile(join(root,'public/two.mjs'),'import {state} from "./shared.mjs"; window.calls.push("two:"+(++state.count));');
    const report=await buildDashboard(root), calls=[];
    const code=await readFile(join(root,'public',report.asset),'utf8');
    vm.runInNewContext(code,{window:{calls}},{timeout:1000});
    assert.deepEqual(calls,['shared','one:1','two:2']);
    assert.equal(report.module_entries,2);assert.equal(report.source_module_requests,3);
    assert.equal(await readFile(join(root,'public/index.html'),'utf8'),html,'buildless source stays intact');
    const optimized=await readFile(join(root,'.sites-runtime/dashboard/index.html'),'utf8');
    assert.equal((optimized.match(/type="module"/g)||[]).length,1);
    assert.ok(optimized.startsWith('<script defer src="/core.js"></script>'));
    assert.ok(optimized.endsWith('<main>Weather</main>'));
    const plugin=dashboardBundle();plugin.configResolved({root});
    assert.equal(await plugin.load(join(root,'public/index.html')+'?raw'),'export default '+JSON.stringify(optimized)+';');
    assert.equal(await plugin.load(join(root,'public/index.html')),undefined);
    const out=join(root,'dist/client');await mkdir(out,{recursive:true});
    await plugin.writeBundle({dir:out});assert.equal(await readFile(join(out,'index.html'),'utf8'),optimized);
    await writeFile(join(root,'public/two.mjs'),'import {state} from "./shared.mjs"; window.calls.push("changed:"+(++state.count));');
    const changed=await buildDashboard(root);
    assert.notEqual(changed.asset,report.asset,'content change invalidates asset URL');
    await assert.rejects(readFile(join(root,'public',report.asset)),{code:'ENOENT'});
  }finally{
    if(!/^ventusiq-dashboard-[A-Za-z0-9]+$/.test(relative(resolve(tmpdir()),resolve(root))))throw Error('Unexpected temporary test directory');
    await rm(root,{recursive:true,force:true});
  }
});

test('unsupported or duplicate entry tags stop the build rather than dropping features',()=>{
  assert.throws(()=>moduleScripts('<script type="module" src="https://example.com/tool.js"></script>'),/changed/);
  assert.throws(()=>moduleScripts('<script type="module">window.start()</script>'),/changed/);
  assert.throws(()=>moduleScripts('<script type="module" src="/one.js"></script>'.repeat(2)),/Duplicate/);
});
