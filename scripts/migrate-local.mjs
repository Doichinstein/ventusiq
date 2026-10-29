/* Local-only D1 schema setup and upgrades. Never deploys or uses remote D1. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {configureToolEnvironment} from './tool-environment.mjs';
import {schemaSQL,applicationSchema,migrationPlan,parseLocalArgs,backupLocalDatabases} from './local-migration-plan.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
let temporary=null;
try{
  const options=parseLocalArgs(process.argv.slice(2),root),persist=path.resolve(root,options.persist),build=path.join(root,'dist/server/wrangler.json');
  if(!fs.existsSync(build))throw Error('Build configuration is missing. Run npm run build before npm run db:local.');
  const hosting=JSON.parse(fs.readFileSync(path.join(root,'.openai/hosting.json'),'utf8')),built=JSON.parse(fs.readFileSync(build,'utf8')),binding=built.d1_databases?.find(d=>d.binding===hosting.d1);
  if(!binding?.database_id||!binding.database_name)throw Error('Built configuration has no matching D1 binding. Rebuild the hosted edition.');
  const directory=path.join(root,'drizzle'),journal=JSON.parse(fs.readFileSync(path.join(directory,'meta/_journal.json'),'utf8'));
  const migrations=journal.entries.map((entry,i)=>{if(entry.idx!==i||!/^\d{4}_[a-z0-9_]+$/.test(entry.tag))throw Error('Invalid migration journal');const name=entry.tag+'.sql';return {name,sql:fs.readFileSync(path.join(directory,name),'utf8')};});
  if(JSON.stringify(fs.readdirSync(directory).filter(n=>n.endsWith('.sql')).sort())!==JSON.stringify(migrations.map(m=>m.name)))throw Error('SQL files and the ordered migration journal differ. Resolve this before setup.');
  configureToolEnvironment(root);const runtime=path.join(root,'.sites-runtime');fs.mkdirSync(runtime,{recursive:true});temporary=fs.mkdtempSync(path.join(runtime,'db-local-'));
  const config=path.join(temporary,'wrangler.json');fs.writeFileSync(config,JSON.stringify({name:built.name,compatibility_date:built.compatibility_date,d1_databases:[{binding:binding.binding,database_name:binding.database_name,database_id:binding.database_id,migrations_dir:directory}]}));
  const common=['--local','--config',config,'--persist-to',persist],wrangler=path.join(root,'node_modules/wrangler/bin/wrangler.js');
  function call(args,{json=false}={}){const result=spawnSync(process.execPath,['--import',pathToFileURL(path.join(root,'scripts/sites-env.mjs')).href,wrangler,'d1',...args,...common,...(json?['--json']:[])],{cwd:root,encoding:'utf8',env:{...process.env,CI:'true'},maxBuffer:8*1024*1024});if(result.error)throw result.error;if(result.status!==0)throw Error((result.stderr||result.stdout||'Local D1 command failed').trim());if(json){const data=JSON.parse(result.stdout);if(!Array.isArray(data)||data.some(r=>r.success!==true))throw Error('Local D1 query failed');return data.flatMap(r=>r.results||[]);}console.log('Local D1 '+args.slice(0,2).join(' ')+' completed.');}
  const query=sql=>call(['execute',binding.binding,'--command',sql],{json:true}),schema=query(schemaSQL),hasLedger=schema.some(r=>r.name==='d1_migrations'),applied=hasLedger?query('SELECT name FROM d1_migrations ORDER BY id').map(r=>r.name):null;
  const plan=migrationPlan({migrations,schema,applied,adopt:options.adopt});
  console.log('Local database: '+persist);console.log(`${plan.applied}/${migrations.length} migrations recognized; ${plan.pending.length} pending.`);
  if(plan.applied&&(plan.adopt||plan.pending.length)){const backupDir=path.join(runtime,'db-backups');fs.mkdirSync(backupDir,{recursive:true});const backup=path.join(backupDir,new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID());const snapshots=backupLocalDatabases(persist,backup);fs.writeFileSync(path.join(backup,'manifest.json'),JSON.stringify({created_at:new Date().toISOString(),persist,snapshots},null,2));console.log('Pre-upgrade SQLite backup directory: '+backup);}
  if(plan.adopt){
    // Let Wrangler create its own ledger; verify its contract before recording
    // the exact schema-only prefix found above. A partial interruption is rejected
    // by the next run's ledger/schema comparison rather than silently replayed.
    call(['migrations','list',binding.binding]);const columns=query('PRAGMA table_info(d1_migrations)').map(c=>c.name);if(JSON.stringify(columns)!==JSON.stringify(['id','name','applied_at']))throw Error('Unexpected Wrangler migration ledger schema; adoption stopped.');
    const names=migrations.slice(0,plan.applied).map(m=>"('"+m.name+"')").join(',');query('INSERT INTO d1_migrations(name) VALUES '+names);
    console.log('Adopted the verified manual migration prefix; application records were preserved.');
  }
  call(['migrations','apply',binding.binding]);
  const finalSchema=applicationSchema(query(schemaSQL)),finalApplied=query('SELECT name FROM d1_migrations ORDER BY id').map(r=>r.name);
  if(JSON.stringify(finalSchema)!==JSON.stringify(plan.expected)||JSON.stringify(finalApplied)!==JSON.stringify(migrations.map(m=>m.name)))throw Error('Post-migration schema/ledger verification failed. Keep the backup and inspect the local database.');
  console.log(`Local schema verified: all ${migrations.length} migrations applied. Safe to run this command again after future builds.`);
}catch(error){console.error(error.message);process.exitCode=1;}
finally{if(temporary){const config=path.join(temporary,'wrangler.json');if(fs.existsSync(config))fs.unlinkSync(config);if(!fs.readdirSync(temporary).length)fs.rmdirSync(temporary);}}
