import { Store } from './store.ts';
import { Arena } from './arena.ts';
import { createApp } from './api.ts';

const store=new Store(process.env.AGENA_DB ?? 'data/agena.db');
const arena=new Arena(store);
if(store.list().length===0){
  for(const agent of ['simple','persistent'] as const){const run=arena.create(agent,42,true);await arena.finish(run.id);}
}
const port=Number(process.env.PORT??3001);
const server=createApp(arena).listen(port,'0.0.0.0',()=>console.log(`AGENA · http://localhost:${port} · monde fictif, agents scriptés`));
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,async()=>{server.close();await arena.close();store.close();process.exit(0);});
