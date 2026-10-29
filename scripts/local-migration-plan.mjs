import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
export const schemaSQL="SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type,name";
export function applicationSchema(rows){return rows.filter(r=>!r.name.startsWith('sqlite_')&&!r.name.startsWith('_cf_')&&r.name!=='d1_migrations').map(r=>({type:r.type,name:r.name,tbl_name:r.tbl_name,sql:r.sql.replace(/\r\n/g,'\n').trim()})).sort((a,b)=>a.type.localeCompare(b.type)||a.name.localeCompare(b.name));}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function expectedSchemas(migrations){
  const db=new DatabaseSync(':memory:');try{const schemas=[applicationSchema(db.prepare(schemaSQL).all())];for(const migration of migrations){db.exec(migration.sql);schemas.push(applicationSchema(db.prepare(schemaSQL).all()));}return schemas;}finally{db.close();}
}
function schemaOnly(sql){
  // Legacy adoption cannot infer whether a data transformation ran. Permit only
  // the additive schema statements used by the historical manual instructions.
  const statements=sql.replace(/--[^\n]*/g,'').split(';').map(s=>s.trim()).filter(Boolean);
  return statements.length>0&&statements.every(s=>! /\b(?:INSERT|UPDATE|DELETE|REPLACE|SELECT|DROP)\b/i.test(s)&&(/^CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX)\s/i.test(s)||/^ALTER\s+TABLE\s+[`"\w]+\s+ADD\s/i.test(s)));
}
export function migrationPlan({migrations,schema,applied=null,adopt=false}){
  const expected=expectedSchemas(migrations),current=applicationSchema(schema);let count;
  if(applied!==null){
    if(applied.length>migrations.length||applied.some((name,i)=>name!==migrations[i]?.name))throw Error('Local migration ledger does not match this checkout. Stop and reconcile the checkout/database versions.');
    count=applied.length;
    if(!same(current,expected[count]))throw Error('Local schema differs from its migration ledger. No migrations were applied; inspect the database or restore its backup.');
  }else if(!current.length){count=0;}
  else{
    if(!adopt)throw Error('This local database was initialized manually. Stop the local server, then rerun with --adopt-existing to verify its schema and preserve its data before upgrading.');
    const matches=expected.map((s,i)=>same(s,current)?i:-1).filter(i=>i>=0);
    if(matches.length!==1)throw Error('Existing schema does not match one exact migration prefix. Automatic adoption is unsafe; no migrations were applied.');
    count=matches[0];if(!migrations.slice(0,count).every(m=>schemaOnly(m.sql)))throw Error('Existing migrations include data changes that cannot be verified from schema. Automatic adoption is unavailable.');
  }
  return {applied:count,pending:migrations.slice(count).map(m=>m.name),adopt:applied===null&&count>0,expected:expected.at(-1)};
}
export function parseLocalArgs(args,root){
  let adopt=false,persist=null;for(let i=0;i<args.length;i++){if(args[i]==='--adopt-existing')adopt=true;else if(args[i]==='--persist-to'&&args[i+1]&&!args[i+1].startsWith('--'))persist=args[++i];else throw Error('Usage: npm run db:local -- [--adopt-existing] [--persist-to DIRECTORY]. Remote operations are not supported.');}
  return {adopt,persist:persist||root+'/.wrangler/state'};
}
export function backupLocalDatabases(persist,destination){
  const source=path.resolve(persist,'v3/d1'),files=[];
  function walk(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isSymbolicLink())throw Error('Local D1 persistence contains a symlink; backup stopped.');if(entry.isDirectory())walk(file);else if(entry.isFile()&&entry.name.endsWith('.sqlite'))files.push(file);}}
  walk(source);if(!files.length)throw Error('No local D1 SQLite files found; backup stopped.');
  fs.mkdirSync(destination,{recursive:false});const snapshots=[];
  for(const file of files){const relative=path.relative(source,file),target=path.join(destination,relative);fs.mkdirSync(path.dirname(target),{recursive:true});const db=new DatabaseSync(file,{readOnly:true});try{db.exec('PRAGMA busy_timeout=5000');db.exec("VACUUM INTO '"+target.replaceAll("'","''")+"'");}finally{db.close();}const snapshot=new DatabaseSync(target,{readOnly:true});try{if(snapshot.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Local backup integrity check failed');}finally{snapshot.close();}snapshots.push({source:file,backup:target});}
  return snapshots;
}
