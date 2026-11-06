import express from 'express';
import { z } from 'zod';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { Arena } from './arena.ts';
import { evaluate } from './evaluator.ts';
import { SCENARIO } from './scenario.ts';

export function createApp(arena: Arena) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method === 'POST' && !req.is('application/json')) { res.status(415).json({ error:'Une requête JSON est requise.' }); return; }
    const origin = req.headers.origin;
    if (req.method === 'POST' && origin && new URL(origin).host !== req.headers.host) {
      // Vite forwards the original host; local development may use its own port.
      if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) { res.status(403).json({error:'Origine non autorisée.'}); return; }
    }
    next();
  });
  app.get('/api/health', (_req,res)=>res.json({ok:true}));
  app.get('/api/meta', (_req,res)=>res.json({scenario:SCENARIO,agents:[{id:'persistent',name:'Avec mémoire',kind:'scripted'},{id:'simple',name:'Réactif simple',kind:'scripted'}]}));
  app.get('/api/runs', (_req,res)=>res.json(arena.store.list().map(r=>({id:r.id,agent:r.agent,seed:r.seed,status:r.status,createdAt:r.createdAt,now:r.world.now,metrics:r.metrics,evaluation:evaluate(r)}))));
  app.get('/api/runs/:id', (req,res)=>{
    const run=arena.store.get(req.params.id);
    if(!run){res.status(404).json({error:'Exécution introuvable.'});return;}
    res.json({...run,evaluation:evaluate(run)});
  });
  app.get('/api/runs/:id/export', (req,res)=>{
    const run=arena.store.get(req.params.id);
    if(!run){res.status(404).json({error:'Exécution introuvable.'});return;}
    res.setHeader('Content-Disposition',`attachment; filename="agena-${run.agent}-${run.seed}-${run.id}.json"`);
    res.json({format:'agena-run-v1',scenario:SCENARIO,run,evaluation:evaluate(run)});
  });
  app.post('/api/runs', (req,res)=>{
    const parsed=z.object({agent:z.enum(['simple','persistent']),seed:z.number().int().min(0).max(4294967295).default(42),crash:z.boolean().default(true),cadenceMs:z.number().int().min(0).max(2000).default(550)}).strict().safeParse(req.body);
    if(!parsed.success){res.status(400).json({error:'Configuration invalide.'});return;}
    if([...arena.runtimes.values()].filter(r=>['running','paused','ready'].includes(r.run.status)).length>=8){res.status(429).json({error:'Huit exécutions sont déjà actives. Termine-en une avant de recommencer.'});return;}
    const run=arena.create(parsed.data.agent,parsed.data.seed,parsed.data.crash);
    void arena.finish(run.id,parsed.data.cadenceMs);
    res.status(201).json({id:run.id});
  });
  app.post('/api/runs/:id/:action',async(req,res)=>{
    if(!arena.store.get(req.params.id)){res.status(404).json({error:'Exécution introuvable.'});return;}
    try{
      switch(req.params.action){
        case 'pause':await arena.pause(req.params.id);break;
        case 'resume':void arena.finish(req.params.id,550);break;
        case 'crash':arena.crash(req.params.id);break;
        case 'arm-crash':arena.armCrash(req.params.id);break;
        default:res.status(404).json({error:'Commande inconnue.'});return;
      }
      res.json({ok:true});
    }catch(error){res.status(409).json({error:error instanceof Error?error.message:'Commande impossible.'});}
  });
  const dist=resolve('dist');
  if(existsSync(dist)){
    app.use(express.static(dist));
    app.get('/{*path}',(req,res)=>{if(req.path.startsWith('/api/'))res.status(404).json({error:'Route inconnue.'});else res.sendFile(resolve(dist,'index.html'));});
  }
  app.use((error:Error,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{res.status(400).json({error:error instanceof SyntaxError?'JSON invalide.':'Requête invalide.'});});
  return app;
}
