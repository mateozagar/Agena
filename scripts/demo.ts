import { mkdirSync, writeFileSync } from 'node:fs';
import { Store } from '../server/store.ts';
import { Arena } from '../server/arena.ts';
import { evaluate } from '../server/evaluator.ts';
import { SCENARIO } from '../server/scenario.ts';

const store=new Store(':memory:');const arena=new Arena(store);
const seed=Number(process.argv[2]??42);
if(!Number.isInteger(seed)||seed<0||seed>4294967295)throw new Error('Seed must be an integer between 0 and 4294967295');
mkdirSync('data/exports',{recursive:true});
try{
  for(const agent of ['simple','persistent'] as const){
    const r=arena.create(agent,seed,true);await arena.finish(r.id);
    const run=store.get(r.id)!;const evaluation=evaluate(run);
    writeFileSync(`data/exports/${agent}-${seed}.json`,JSON.stringify({format:'agena-run-v1',scenario:SCENARIO,run,evaluation},null,2));
    console.log(`${agent}: ${run.status}, ${run.world.calendar.length} événement(s), ${run.crashCount} crash, ${(run.metrics.computeMs/1000).toFixed(2)} s de calcul`);
    for(const c of evaluation.criteria)console.log(`  ${c.status.padEnd(10)} ${c.label}: ${c.detail}`);
  }
}finally{await arena.close();store.close();}
