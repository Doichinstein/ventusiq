import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

export function dashboardBundle() {
  let root;
  const optimized=()=>readFile(resolve(root,'.sites-runtime/dashboard/index.html'),'utf8');
  return {name:'ventusiq-dashboard-bundle',enforce:'pre',apply:'build',
    configResolved(config){root=config.root;},
    async load(id){
      if(id.replaceAll('\\','/')===resolve(root,'public/index.html').replaceAll('\\','/')+'?raw')
        return 'export default '+JSON.stringify(await optimized())+';';
    },
    async writeBundle(options){
      // Both the Worker route and the static index use the same generated HTML.
      if(options.dir && resolve(options.dir)===resolve(root,'dist/client'))
        await writeFile(resolve(options.dir,'index.html'),await optimized());
    },
  };
}
