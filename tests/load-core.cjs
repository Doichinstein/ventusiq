const fs=require('node:fs');
const vm=require('node:vm');
const load=vm.runInThisContext('(function(module){'+fs.readFileSync(require.resolve('../public/weather-core.js'),'utf8')+'\n})');
load(module);
