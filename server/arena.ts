import { fork, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { AgentKind, Json, Observation, Run, ToolRequest } from '../shared/types.ts';
import { initialWorld, scenarioEvents, applyEvent, SCENARIO } from './scenario.ts';
import { append, executeTool } from './world.ts';
import { Store } from './store.ts';

interface Runtime { run: Run; child?: ChildProcess; loop?: Promise<void>; pauseRequested: boolean; cancelDelay?: () => void; closing: boolean }
export class Arena {
  store: Store;
  runtimes = new Map<string, Runtime>();
  constructor(store: Store) {
    this.store = store;
    for (const run of store.list()) {
      if (run.status === 'running') {
        run.status = 'paused';
        if (run.pendingObservation) run.pendingObservation.resumed = true;
        append(run, 'lifecycle', 'Superviseur relancé · reprise disponible', { event: 'supervisor-recovery' });
        store.save(run);
      }
    }
  }
  create(agent: AgentKind, seed = 42, crashAfterCreate = true): Run {
    const run: Run = { id: randomUUID(), agent, seed, scenarioVersion: SCENARIO.version, status: 'ready', createdAt: new Date().toISOString(), world: initialWorld(), queue: scenarioEvents(seed), journal: [], memories: [], metrics: { computeMs: 0, toolCalls: 0, modelCalls: 0, inputTokens: 0, outputTokens: 0, processes: 0 }, crashArmed: crashAfterCreate, crashAfterCreate, crashCount: 0, checkpoint: 0, pendingObservation: null };
    append(run, 'lifecycle', 'Monde initialisé · données fictives', { event: 'initialized', seed, scenarioVersion: SCENARIO.version, agent, agentKind: 'scripted' });
    this.store.save(run);
    this.runtimes.set(run.id, { run, pauseRequested: false, closing: false });
    return run;
  }
  runtime(id: string): Runtime {
    const existing = this.runtimes.get(id);
    if (existing) return existing;
    const run = this.store.get(id);
    if (!run) throw new Error('RUN_NOT_FOUND');
    const rt = { run, pauseRequested: false, closing: false };
    this.runtimes.set(id, rt); return rt;
  }
  async finish(id: string, cadenceMs = 0): Promise<void> {
    const rt = this.runtime(id);
    if (rt.loop) return rt.loop;
    if (rt.run.status === 'completed' || rt.run.status === 'failed') return;
    rt.pauseRequested = false;
    rt.run.status = 'running'; this.store.save(rt.run);
    rt.loop = this.runLoop(rt, cadenceMs).finally(() => { rt.loop = undefined; });
    return rt.loop;
  }
  async pause(id: string) {
    const rt = this.runtime(id);
    rt.pauseRequested = true; rt.cancelDelay?.();
    await rt.loop;
  }
  armCrash(id: string) {
    const rt = this.runtime(id);
    if (['completed','failed'].includes(rt.run.status)) throw new Error('RUN_FINISHED');
    rt.run.crashArmed = true;
    append(rt.run, 'lifecycle', 'Crash armé après la prochaine création confirmée', { event: 'crash-armed' }); this.store.save(rt.run);
  }
  crash(id: string) {
    const rt = this.runtime(id);
    if (!rt.child || !rt.child.pid || rt.child.exitCode !== null || rt.child.signalCode) throw new Error('NO_AGENT_PROCESS');
    append(rt.run, 'lifecycle', 'Interruption manuelle demandée', { event: 'manual-crash', pid: rt.child.pid });
    rt.run.crashCount++;
    if (rt.run.pendingObservation) rt.run.pendingObservation.resumed = true;
    this.store.save(rt.run);
    rt.child.kill('SIGKILL');
  }
  spawn(rt: Runtime) {
    const child = fork(new URL('./worker.ts', import.meta.url), [rt.run.agent], { execArgv: ['--disable-warning=ExperimentalWarning'], env: { NODE_ENV: 'production' }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    rt.child = child; rt.run.metrics.processes++;
    append(rt.run, 'lifecycle', 'Processus agent démarré', { event: 'spawn', pid: child.pid ?? null, generation: rt.run.metrics.processes });
    child.on('exit', (code, signal) => {
      append(rt.run, 'lifecycle', signal === 'SIGKILL' ? 'Processus réellement interrompu · SIGKILL' : 'Processus agent arrêté', { event: 'exit', pid: child.pid ?? null, code, signal });
      if (rt.child === child) rt.child = undefined;
      this.store.save(rt.run);
    });
    child.on('error', () => { /* The active turn reports process startup failures. */ });
    return child;
  }
  async turn(rt: Runtime, observation: Observation): Promise<'done' | 'crashed'> {
    const child = rt.child ?? this.spawn(rt);
    return new Promise((resolve, reject) => {
      let calls = 0;
      const cleanup = () => { clearTimeout(timeout); child.off('message', onMessage); child.off('exit', onExit); child.off('error', onError); };
      const onError = (error: Error) => { cleanup(); reject(error); };
      const onExit = (_code: number | null, signal: string | null) => { cleanup(); signal === 'SIGKILL' ? resolve('crashed') : reject(new Error('AGENT_EXITED_UNEXPECTEDLY')); };
      const onMessage = (raw: unknown) => {
        const message = raw as ToolRequest & { message?: string };
        if ((message.type as string) === 'done') { cleanup(); resolve('done'); return; }
        if ((message.type as string) === 'agent-error') { cleanup(); reject(new Error(message.message)); return; }
        if (message.type !== 'tool') return;
        if (++calls > 80) { cleanup(); child.kill('SIGKILL'); reject(new Error('TOOL_BUDGET_EXCEEDED')); return; }
        try {
          const result = executeTool(rt.run, message.name, message.args);
          // Effect and journal are committed before the acknowledgement or SIGKILL.
          this.store.save(rt.run);
          const entry = rt.run.journal.at(-1)!;
          if (rt.run.crashArmed && message.name === 'calendar.create' && result.ok && entry.data.created) {
            rt.run.crashArmed = false; rt.run.crashCount++;
            append(rt.run, 'lifecycle', 'Événement écrit · confirmation interrompue', { event: 'crash-boundary', committedSeq: entry.seq, pid: child.pid ?? null, acknowledgementDelivered: false });
            this.store.save(rt.run);
            child.kill('SIGKILL'); return;
          }
          if (child.connected) child.send({ type: 'result', id: message.id, result });
        } catch (error) { cleanup(); reject(error); }
      };
      const timeout = setTimeout(() => { cleanup(); child.kill('SIGKILL'); reject(new Error('AGENT_TURN_TIMEOUT')); }, 15000);
      child.on('message', onMessage); child.once('exit', onExit); child.once('error', onError);
      child.send({ type: 'observe', observation });
    });
  }
  async stopChild(rt: Runtime) {
    const child = rt.child;
    if (!child || child.exitCode !== null || child.signalCode) return;
    await new Promise<void>(resolve => { child.once('exit', () => resolve()); child.kill('SIGTERM'); });
  }
  async runLoop(rt: Runtime, cadenceMs: number) {
    const r = rt.run;
    try {
      while (!rt.closing && (r.queue.length || r.pendingObservation)) {
        if (rt.pauseRequested) { r.status = 'paused'; append(r, 'lifecycle', 'Simulation en pause', { event: 'pause' }); this.store.save(r); return; }
        const start = performance.now();
        let observation = r.pendingObservation;
        if (!observation) {
          const event = r.queue.shift()!;
          applyEvent(r.world, event);
          append(r, 'world', event.title, { eventId: event.id, eventKind: event.kind, ...(event.data ?? {}) });
          observation = { now: r.world.now, event, resumed: false };
          r.pendingObservation = observation;
        }
        append(r, 'observation', observation.resumed ? 'Reprise · observation remise à l’agent' : 'Observation transmise à l’agent', { observation: observation as unknown as Json });
        this.store.save(r);
        const result = await this.turn(rt, observation);
        r.metrics.computeMs += performance.now() - start;
        if (result === 'crashed') {
          if (r.crashCount > 5) throw new Error('CRASH_LIMIT_EXCEEDED');
          observation.resumed = true;
        } else { r.pendingObservation = null; r.checkpoint++; }
        this.store.save(r);
        if (cadenceMs > 0 && !rt.pauseRequested && !rt.closing) await new Promise<void>(resolve => {
          const timer = setTimeout(() => { rt.cancelDelay = undefined; resolve(); }, cadenceMs);
          rt.cancelDelay = () => { clearTimeout(timer); rt.cancelDelay = undefined; resolve(); };
        });
      }
      if (rt.closing) { r.status = 'paused'; this.store.save(r); return; }
      r.status = 'completed';
      await this.stopChild(rt);
      append(r, 'lifecycle', 'Exécution terminée · preuves disponibles', { event: 'completed' }); this.store.save(r);
    } catch (error) {
      r.status = 'failed'; r.error = error instanceof Error ? error.message : String(error);
      append(r, 'lifecycle', 'Exécution interrompue par une erreur', { event: 'failed', error: r.error });
      await this.stopChild(rt); this.store.save(r);
    }
  }
  async close() {
    for (const rt of this.runtimes.values()) { rt.closing = true; rt.pauseRequested = true; rt.cancelDelay?.(); }
    await Promise.all([...this.runtimes.values()].map(async rt => { await rt.loop; await this.stopChild(rt); }));
  }
}
