#!/usr/bin/env node
import {readFile,writeFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {verifyForwardCohort,collectForwardOutcomes,scoreForwardOutcomes,sha} from '../lib/analog-forward.mjs';

const args=process.argv.slice(2),options={};
const usage='node scripts/score-analog-cohort.mjs --cohort FILE --plan FILE --output NEW_FILE [--fetch-outcomes | --outcomes FILE]';
async function readJSON(path){const info=await stat(path);if(!info.isFile()||info.size>32*1024*1024)throw Error('Input must be a JSON file of at most 32 MiB');return JSON.parse(await readFile(path,'utf8'));}
try{
  for(let i=0;i<args.length;i++){
    const key=args[i];if(key==='--help'){console.log(usage);process.exit(0);}
    if(!['--cohort','--plan','--output','--outcomes','--fetch-outcomes'].includes(key)||options[key]!==undefined)throw Error('Unknown or repeated argument. '+usage);
    if(key==='--fetch-outcomes')options[key]=true;else{if(!args[i+1]||args[i+1].startsWith('--'))throw Error('Missing argument. '+usage);options[key]=resolve(args[++i]);}
  }
  if(!options['--cohort']||!options['--plan']||!options['--output']||(options['--outcomes']&&options['--fetch-outcomes']))throw Error(usage);
  if([options['--cohort'],options['--plan'],options['--outcomes']].includes(options['--output']))throw Error('Output must not overwrite an input');
  try{await stat(options['--output']);throw Error('Output already exists; choose a new file');}catch(error){if(error.code!=='ENOENT')throw error;}
  const [bundle,plan]=await Promise.all([readJSON(options['--cohort']),readJSON(options['--plan'])]);
  const cohort=verifyForwardCohort(bundle,plan);
  let outcomes;
  if(options['--fetch-outcomes'])outcomes=await collectForwardOutcomes(cohort);
  else if(options['--outcomes']){const input=await readJSON(options['--outcomes']);if(input.document&&sha(input.document)!==input.integrity?.sha256)throw Error('Imported evaluation artifact hash mismatch');outcomes=input.document?.outcomes||input;}
  else outcomes={schema:'ventusiq-analog-outcomes/1',cohort_sha256:cohort.cohort_sha256,requested_at:new Date().toISOString(),editions:[],errors:[]};
  const report=scoreForwardOutcomes(cohort,outcomes);
  const document={report,outcomes},output={document,integrity:{algorithm:'SHA-256 of JSON.stringify(document)',sha256:sha(document)}};
  const serialized=JSON.stringify(output,null,2)+'\n';if(Buffer.byteLength(serialized)>32*1024*1024)throw Error('Evaluation artifact exceeds 32 MiB; reduce cohort size before registration');
  await writeFile(options['--output'],serialized,{flag:'wx',encoding:'utf8'});
  const readback=await readJSON(options['--output']);if(sha(readback.document)!==output.integrity.sha256)throw Error('Output readback mismatch');
  console.log(JSON.stringify({output:options['--output'],sha256:output.integrity.sha256,cohort_sha256:cohort.cohort_sha256,cases:report.scheduled_points,grid_days:report.scheduled_grid_days,unique_grids:report.unique_grids,source_editions:outcomes.editions.length,source_errors:outcomes.errors.length,variables:Object.fromEntries(Object.entries(report.metrics).map(([key,m])=>[key,{paired_points:m.paired_points,paired_groups:m.paired_groups,pending_points:m.pending_points,missing_outcome_points:m.missing_outcome_points,insufficient_prediction_points:m.insufficient_prediction_points}]))}));
}catch(error){console.error(error.message);process.exitCode=1;}
