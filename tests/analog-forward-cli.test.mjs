import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,unlinkSync,rmdirSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
import {cohortFixture} from './analog-forward-fixture.mjs';
import {sha} from '../lib/analog-forward.mjs';

test('operator command creates a reproducible artifact, refuses overwrite and verifies imported artifacts',()=>{
  const dir=mkdtempSync(join(tmpdir(),'ventusiq-forward-test-')),paths=Object.fromEntries(['cohort','plan','output','copy','tampered','rejected'].map(key=>[key,join(dir,key+'.json')]));
  const fixture=cohortFixture(),script=fileURLToPath(new URL('../scripts/score-analog-cohort.mjs',import.meta.url));
  try{
    writeFileSync(paths.cohort,JSON.stringify(fixture.bundle));writeFileSync(paths.plan,JSON.stringify(fixture.plan));
    const run=(output,...extra)=>spawnSync(process.execPath,[script,'--cohort',paths.cohort,'--plan',paths.plan,'--output',output,...extra],{encoding:'utf8'});
    const first=run(paths.output);assert.equal(first.status,0,first.stderr);const bytes=readFileSync(paths.output,'utf8'),result=JSON.parse(bytes);
    assert.equal(sha(result.document),result.integrity.sha256);assert.equal(result.document.report.scheduled_points,3);assert.equal(result.document.outcomes.editions.length,0);
    const repeat=run(paths.output);assert.equal(repeat.status,1);assert.match(repeat.stderr,/already exists/);assert.equal(readFileSync(paths.output,'utf8'),bytes);
    const copy=run(paths.copy,'--outcomes',paths.output);assert.equal(copy.status,0,copy.stderr);assert.equal(JSON.parse(readFileSync(paths.copy)).document.report.cohort_sha256,fixture.plan.cohort_sha256);
    result.document.report.scheduled_points=999;writeFileSync(paths.tampered,JSON.stringify(result));const bad=run(paths.rejected,'--outcomes',paths.tampered);assert.equal(bad.status,1);assert.match(bad.stderr,/artifact hash mismatch/);assert.equal(existsSync(paths.rejected),false);
    assert.deepEqual(JSON.parse(readFileSync(paths.cohort)),fixture.bundle);
  }finally{for(const path of Object.values(paths))if(existsSync(path))unlinkSync(path);rmdirSync(dir);}
});
