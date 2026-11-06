import { mkdirSync, writeFileSync } from 'node:fs';
import { Store } from '../server/store.ts';
import { Arena } from '../server/arena.ts';
import { evaluate } from '../server/evaluator.ts';
import { SCENARIO } from '../server/scenario.ts';

const store=new Store(':memory:');const arena=new Arena(store);
mkdirSync('public/demo',{recursive:true});
try{
  const summaries=[];
  for(const kind of ['persistent','simple'] as const){
    const r=arena.create(kind,42,true);await arena.finish(r.id);
    const run=store.get(r.id)!;const evaluation=evaluate(run);
    if(run.status!=='completed')throw new Error(`Demo generation failed: ${run.error}`);
    const view={...run,evaluation};
    writeFileSync(`public/demo/${run.id}.json`,JSON.stringify(view));
    writeFileSync(`public/demo/${run.id}-export.json`,JSON.stringify({format:'agena-run-v1',scenario:SCENARIO,run,evaluation},null,2));
    summaries.push({id:run.id,agent:run.agent,seed:run.seed,status:run.status,createdAt:run.createdAt,now:run.world.now,metrics:run.metrics,evaluation});
  }
  writeFileSync('public/demo/runs.json',JSON.stringify(summaries));
  console.log('Two real scripted executions exported for the read-only public replay.');
}finally{await arena.close();store.close();}
