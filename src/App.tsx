import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowDownToLine, ArrowRight, BookOpen, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronRight, Circle, Clock3, Database, FileText, FlaskConical, GitBranch, Mail, MemoryStick, MoreHorizontal, Pause, Play, RotateCcw, Search, ShieldCheck, Square, Users, X, XCircle, Zap } from 'lucide-react';
import type { AgentKind, Criterion, JournalEntry, RunView } from '../shared/types.ts';
import { replayAt } from '../shared/replay.ts';

type Summary = Pick<RunView,'id'|'agent'|'seed'|'status'|'createdAt'|'metrics'|'evaluation'> & {now:string};
type Pane = 'arena'|'world'|'method';
const STATIC = import.meta.env.VITE_DEMO_MODE === 'true';
const exportUrl = (id:string) => STATIC ? `${import.meta.env.BASE_URL}demo/${id}-export.json` : `/api/runs/${id}/export`;
const START = Date.parse('2030-04-01T09:00:00.000Z');
const DAY = 86400000;
const agentName = (agent:AgentKind) => agent==='persistent'?'Avec mémoire':'Réactif simple';
const date = (at:string, time=false) => new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',timeZone:'UTC',...(time?{hour:'2-digit',minute:'2-digit'}:{})}).format(new Date(at));
const day = (at:string) => Math.min(30,Math.max(0,Math.floor((Date.parse(at)-START)/DAY)));
async function api<T>(path:string, body?:unknown):Promise<T>{
  if(STATIC){
    if(body!==undefined)throw new Error('Cette démo publique est un replay en lecture seule. Lancez le serveur Node du dépôt pour exécuter un agent.');
    path=path==='/api/runs'?`${import.meta.env.BASE_URL}demo/runs.json`:`${import.meta.env.BASE_URL}demo/${path.split('/').at(-1)}.json`;
  }
  const response=await fetch(path,body===undefined?undefined:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error??'Le serveur ne répond pas.');
  return data as T;
}
const labels:Record<string,string>={pass:'Vérifié',fail:'Échec',pending:'En attente',measured:'Mesuré',not_tested:'Non testé'};

function Mark({status}:{status:Criterion['status']}){
  return <span className={`result-mark ${status}`}>{status==='pass'?<Check size={14}/>:status==='fail'?<X size={14}/>:status==='measured'?<Activity size={14}/>:<MoreHorizontal size={14}/>}</span>;
}
function EventIcon({entry}:{entry:JournalEntry}){
  if(entry.data.signal==='SIGKILL'||entry.data.event==='crash-boundary')return <Zap size={16}/>;
  if(entry.kind==='memory')return <MemoryStick size={16}/>;
  if(entry.kind==='world')return entry.data.eventKind==='mail'?<Mail size={16}/>:<Clock3 size={16}/>;
  if(entry.kind==='tool')return String(entry.data.name).startsWith('calendar')?<CalendarDays size={16}/>:<GitBranch size={16}/>;
  if(entry.kind==='report')return <FileText size={16}/>;
  return <Activity size={16}/>;
}

export function App(){
  const [runs,setRuns]=useState<Summary[]>([]);
  const [selected,setSelected]=useState('');
  const [run,setRun]=useState<RunView|null>(null);
  const [pane,setPane]=useState<Pane>('arena');
  const [agent,setAgent]=useState<AgentKind>('persistent');
  const [seed,setSeed]=useState(42);
  const [crashEnabled,setCrashEnabled]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [ready,setReady]=useState(false);
  const [filter,setFilter]=useState('highlights');
  const [query,setQuery]=useState('');
  const [detail,setDetail]=useState<JournalEntry|null>(null);
  const [expandedCriterion,setExpandedCriterion]=useState<string|null>(null);
  const [replay,setReplay]=useState<number|null>(null);
  const [playing,setPlaying]=useState(false);
  const [speed,setSpeed]=useState(4);
  const [readSeconds,setReadSeconds]=useState(0);
  const [worldTab,setWorldTab]=useState('calendar');

  const refreshList=useCallback(async()=>{const data=await api<Summary[]>('/api/runs');setRuns(data);return data;},[]);
  useEffect(()=>{let cancelled=false;refreshList().then(data=>{if(!cancelled){setSelected(data[0]?.id??'');setReady(true);}}).catch(e=>{if(!cancelled){setError(e.message);setReady(true);}});return()=>{cancelled=true;};},[refreshList]);
  useEffect(()=>{
    if(!selected)return;
    let cancelled=false;let first=true;
    const poll=()=>api<RunView>(`/api/runs/${selected}`).then(data=>{if(!cancelled){setRun(data);if(first){setAgent(data.agent);setSeed(data.seed);first=false;}}}).catch(e=>{if(!cancelled)setError(e.message);});
    void poll();if(STATIC)return()=>{cancelled=true;};const timer=setInterval(()=>{void poll();void refreshList().catch(()=>{});},900);
    return()=>{cancelled=true;clearInterval(timer);};
  },[selected,refreshList]);
  useEffect(()=>{
    if(!playing||!run)return;
    const timer=setInterval(()=>{
      setReadSeconds(v=>v+0.25);
      setReplay(v=>Math.min(run.journal.length,(v??0)+speed));
    },250);
    return()=>clearInterval(timer);
  },[playing,speed,run?.id,run?.journal.length]);
  useEffect(()=>{if(run&&replay!==null&&replay>=run.journal.length)setPlaying(false);},[replay,run?.journal.length]);
  const view=useMemo(()=>run&&replay!==null?replayAt(run,replay):run,[run,replay]);
  const choose=(id:string)=>{setSelected(id);setReplay(null);setPlaying(false);setReadSeconds(0);setDetail(null);setExpandedCriterion(null);};
  const command=async(action:string)=>{if(!run)return;setBusy(true);setError('');try{await api(`/api/runs/${run.id}/${action}`,{});setRun(await api<RunView>(`/api/runs/${run.id}`));await refreshList();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  const start=async()=>{setBusy(true);setError('');try{const {id}=await api<{id:string}>('/api/runs',{agent,seed,crash:crashEnabled});await refreshList();choose(id);setPane('arena');}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  const startReplay=()=>{setReplay(1);setPlaying(true);setReadSeconds(0);setFilter('highlights');setDetail(null);};
  const isLive=run?.status==='running'||run?.status==='paused';
  const latest=(kind:AgentKind)=>runs.find(r=>r.agent===kind);
  const displayEvents=view?.journal.filter(entry=>{
    const highlighted=entry.kind==='world'||entry.kind==='report'||entry.kind==='memory'||entry.data.event==='crash-boundary'||entry.data.signal==='SIGKILL'||entry.data.event==='spawn';
    return (filter==='all'||filter==='highlights'&&highlighted||filter===entry.kind)&&(!query||`${entry.title} ${JSON.stringify(entry.data)}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  })??[];
  const passed=view?.evaluation.criteria.filter(c=>c.status==='pass').length??0;
  const failCount=view?.evaluation.criteria.filter(c=>c.status==='fail').length??0;

  return <div className="app-shell">
    <aside className="sidebar">
      <a href="#arena" className="brand" onClick={()=>setPane('arena')} aria-label="AGENA, accueil"><span className="brand-mark"><Activity size={27} strokeWidth={2.4}/></span>AGENA<span className="version">0.1</span></a>
      <div className="workspace-label"><span className="workspace-dot"/> Laboratoire indépendant <ChevronDown size={13}/></div>
      <nav aria-label="Navigation principale">
        <button className={pane==='arena'?'nav-item active':'nav-item'} onClick={()=>setPane('arena')}><FlaskConical size={18}/>L’arène<span className="nav-count">01</span></button>
        <button className={pane==='world'?'nav-item active':'nav-item'} onClick={()=>setPane('world')}><Database size={18}/>Le monde simulé</button>
        <button className={pane==='method'?'nav-item active':'nav-item'} onClick={()=>setPane('method')}><BookOpen size={18}/>La méthode</button>
      </nav>
      <div className="sidebar-section"><h2>Agents de référence <span>2</span></h2>
        {(['persistent','simple'] as AgentKind[]).map(kind=><button key={kind} className={`agent-nav ${run?.agent===kind?'selected':''}`} onClick={()=>{const r=latest(kind);if(r)choose(r.id);setAgent(kind);setPane('arena');}}><span className={`agent-avatar ${kind}`}>{kind==='persistent'?<MemoryStick size={18}/>:<Zap size={18}/>}</span><span><strong>{agentName(kind)}</strong><small>Agent scripté</small></span><span className="agent-dot"/></button>)}
      </div>
      <div className="sidebar-note"><ShieldCheck size={19}/><p>Une vie fictive.<br/>Des effets vérifiables.</p><span>Aucun compte personnel.<br/>Aucune action externe.</span></div>
      <a className="repo-link" href="https://github.com/mateozagar/Agena" target="_blank" rel="noreferrer"><GitBranch size={15}/>Code & reproductibilité<ArrowRight size={14}/></a>
      <p className="independent">Projet indépendant.<br/>Non officiel OpenAI.</p>
    </aside>

    <main>
      <header className="topbar"><div><span>Laboratoire</span><ChevronRight size={14}/><strong>{pane==='arena'?'L’arène':pane==='world'?'Le monde simulé':'La méthode'}</strong></div><span className="sandbox-status"><span/>Environnement fictif</span></header>
      <div className="page">
        {error&&<div className="error-banner" role="alert"><XCircle size={18}/><span>{error}</span><button onClick={()=>{setError('');void refreshList().then(data=>{if(!selected)setSelected(data[0]?.id??'');}).catch(e=>setError(e.message));}}>Réessayer</button><button onClick={()=>setError('')} aria-label="Fermer l’erreur"><X size={16}/></button></div>}
        {!ready&&<div className="loading"><Activity size={28}/><h1>Le laboratoire se prépare.</h1><p>Connexion aux exécutions enregistrées…</p></div>}
        {ready&&pane==='method'&&<Method/>}
        {ready&&pane==='world'&&view&&<WorldPanel run={view} tab={worldTab} setTab={setWorldTab} replay={replay!==null}/>}
        {ready&&pane==='arena'&&<>
          {STATIC&&<div className="public-notice"><Play size={15}/><span><strong>Démo publique · replays enregistrés.</strong> Les agents scriptés ont été exécutés par le moteur Node. Cette page relit leurs preuves.</span><a href="https://github.com/mateozagar/Agena#démarrer">Exécuter chez soi<ArrowRight size={12}/></a></div>}
          <div className="page-heading"><div><h1>Les agents à l’épreuve du temps.</h1><p>Observez ce qu’ils font, ce qu’ils oublient et comment ils reprennent.</p></div><a className="button secondary export-button" href={run?exportUrl(run.id):undefined} aria-disabled={!run}><ArrowDownToLine size={15}/>Exporter les preuves</a></div>
          <section className="scenario" aria-labelledby="scenario-title">
            <div className="scenario-intro"><div className="scenario-symbol"><CalendarDays size={25}/></div><div><h2 id="scenario-title">La réunion qui change</h2><p>Un rendez-vous à organiser. Une nouvelle contrainte. Un crash au pire moment.</p></div><button className="text-button" onClick={()=>setPane('method')}>Comprendre le test<ArrowRight size={14}/></button></div>
            <div className="scenario-facts"><span><Clock3 size={14}/>30 jours simulés</span><span><Users size={14}/>Léa & Milo · personnes fictives</span><span><ShieldCheck size={14}/>8 critères indépendants</span><span className="fixture-label">Scénario 01 · v1.0</span></div>
          </section>

          <section className="run-bar" aria-label="Configuration et contrôle">
            <label>Agent<select disabled={STATIC} value={agent} onChange={e=>setAgent(e.target.value as AgentKind)}><option value="persistent">Avec mémoire · scripté</option><option value="simple">Réactif simple · scripté</option></select></label>
            <label className="seed-field">Graine<input aria-label="Graine reproductible" disabled={STATIC} type="number" min="0" max="4294967295" value={seed} onChange={e=>setSeed(Number(e.target.value))}/></label>
            <label className="crash-check"><input disabled={STATIC} type="checkbox" checked={crashEnabled} onChange={e=>setCrashEnabled(e.target.checked)}/><span>Crash après création<small>Avant réception de la confirmation</small></span></label>
            <div className="run-actions"><button className="button primary" onClick={()=>void start()} disabled={STATIC||busy||run?.status==='running'}><Play size={15} fill="currentColor"/>Nouvelle exécution</button>{isLive&&<button className="button secondary" onClick={()=>void command(run?.status==='paused'?'resume':'pause')} disabled={busy}>{run?.status==='paused'?<Play size={15}/>:<Pause size={15}/>} {run?.status==='paused'?'Reprendre':'Pause'}</button>}</div>
          </section>
          {!run&&<section className="empty"><FlaskConical size={32}/><h2>Votre première expérience commence ici.</h2><p>Lancez un agent pour voir apparaître les événements et leurs preuves.</p></section>}
          {run&&view&&<>
            <section className={`simulation ${replay!==null?'replaying':''}`} aria-label="Horloges et timeline">
              <div className="simulation-head"><div className="run-identity"><span className={`status-dot ${run.status==='running'&&replay===null?'live':''}`}/><strong>{replay!==null?'Replay accéléré':run.status==='running'?'Exécution en cours':run.status==='paused'?'Exécution en pause':run.status==='failed'?'Exécution interrompue':'Exécution enregistrée'}</strong><span className="muted">{agentName(run.agent)} · scripté</span></div><label className="run-history"><span className="sr-only">Historique des exécutions</span><select value={selected} onChange={e=>choose(e.target.value)}>{runs.map(r=><option key={r.id} value={r.id}>{agentName(r.agent)} · graine {r.seed} · {r.id.slice(0,6)}</option>)}</select></label></div>
              <div className="clocks"><div className="clock-main"><span>Temps dans le monde</span><strong>Jour {day(view.world.now).toString().padStart(2,'0')} <i>/ 30</i></strong><small>{date(view.world.now,true)} UTC</small></div><div><span>Calcul réel {replay!==null?'de l’exécution':''}</span><strong>{(run.metrics.computeMs/1000).toFixed(2)} <i>s</i></strong><small>Hors pauses et cadence visuelle</small></div><div><span>Lecture du replay</span><strong>{replay===null?'—':readSeconds.toFixed(1)} <i>{replay===null?'':'s'}</i></strong><small>{replay===null?'Aucun replay en cours':`${speed*4} entrées / seconde · lecture seule`}</small></div><div className="clock-tools"><span>Consommation réelle</span><strong>{run.metrics.toolCalls} <i>appels outils</i></strong><small>{run.metrics.modelCalls} appel modèle · {run.metrics.inputTokens+run.metrics.outputTokens} token</small></div></div>
              <Timeline run={view} total={run} onSelect={setDetail}/>
              <div className="timeline-bottom"><div className="legend"><span><i className="legend-world"/>Monde</span><span><i className="legend-agent"/>Agent</span><span><i className="legend-crash"/>Crash réel</span></div><div className="play-controls">{isLive&&replay===null?<button className="text-button danger" onClick={()=>void command('crash')} disabled={busy}><Zap size={14}/>Interrompre l’agent</button>:replay===null?<button className="text-button" onClick={startReplay}><RotateCcw size={14}/>Lire le replay</button>:<><button className="icon-button" aria-label={playing?'Pause du replay':'Lire le replay'} onClick={()=>{if(replay>=run.journal.length)setReplay(1);setPlaying(!playing);}}>{playing?<Pause size={15}/>:<Play size={15}/>}</button><input type="range" aria-label="Position du replay" min="1" max={Math.max(1,run.journal.length)} value={replay} onChange={e=>{setReplay(Number(e.target.value));setPlaying(false);setDetail(null);}}/><select aria-label="Vitesse de lecture" value={speed} onChange={e=>setSpeed(Number(e.target.value))}><option value="1">4 entrées/s</option><option value="4">16 entrées/s</option><option value="10">40 entrées/s</option></select><button className="icon-button" aria-label="Quitter le replay" onClick={()=>{setReplay(null);setPlaying(false);}}><X size={15}/></button></>}</div></div>
            </section>

            <div className="evidence-layout"><section className="journal-panel" aria-labelledby="journal-title"><div className="panel-heading"><h2 id="journal-title">Journal de l’expérience <span>{view.journal.length}</span></h2><span className="small-note">Observations & effets visibles</span></div><div className="journal-toolbar"><div className="tabs" role="group" aria-label="Filtrer le journal">{[['highlights','L’essentiel'],['tool','Actions'],['memory','Mémoire'],['observation','Observations'],['all','Tout']].map(([id,label])=><button key={id} className={filter===id?'chosen':''} onClick={()=>setFilter(id!)}>{label}</button>)}</div><label className="journal-search"><Search size={14}/><input aria-label="Rechercher dans le journal" placeholder="Rechercher" value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
              <div className="journal-list">{displayEvents.length===0?<div className="empty small">Aucune entrée pour ce filtre.</div>:displayEvents.map((entry,index)=>{const crash=entry.data.signal==='SIGKILL'||entry.data.event==='crash-boundary';const prev=displayEvents[index-1];return <div key={entry.seq}>{(!prev||day(prev.virtualAt)!==day(entry.virtualAt))&&<div className="day-divider"><span>JOUR {day(entry.virtualAt).toString().padStart(2,'0')}</span><span>{date(entry.virtualAt)}</span><i/></div>}<button className={`journal-row ${crash?'crash-row':''}`} onClick={()=>setDetail(entry)}><time>{new Date(entry.virtualAt).toISOString().slice(11,16)}</time><span className={`event-icon ${crash?'crash':entry.kind}`}><EventIcon entry={entry}/></span><span className="entry-content"><strong>{entry.title}</strong><small>{entry.kind==='world'&&entry.data.body?String(entry.data.body):entry.kind==='memory'?`${String(entry.data.key)} · version ${entry.data.version} · source : ${entry.data.source}`:entry.data.event==='crash-boundary'?'Le calendrier est écrit. La confirmation n’arrive jamais à l’agent.':entry.data.signal==='SIGKILL'?`Processus ${entry.data.pid} terminé par le système.`:entry.data.event==='spawn'?`Processus ${entry.data.pid} · génération ${entry.data.generation}`:entry.kind==='tool'?`Preuve #${entry.seq} · ${entry.data.ok?'effet confirmé ou lecture réussie':'échec de l’outil'}`:entry.kind==='observation'?'Ce que le simulateur a transmis, sans règle de réussite cachée.':'Déclaration observable · vérifiée séparément par l’évaluateur'}</small></span><ChevronRight size={14}/></button></div>;})}</div>
              <div className="journal-footer"><ShieldCheck size={13}/>Ce journal montre des faits observables, aucune chaîne de pensée interne.</div>
            </section>

            <aside className="results-panel" aria-labelledby="results-title"><div className="panel-heading"><h2 id="results-title">Ce que les tests prouvent</h2><FlaskConical size={17}/></div><div className="results-summary"><span className="success-text"><CheckCircle2 size={15}/>{passed} vérifiés</span>{failCount>0&&<span className="failure-text"><XCircle size={15}/>{failCount} échecs</span>}<small>Aucun score global</small></div><div className="criteria-list">{view.evaluation.criteria.map((c,index)=><div key={c.id} className={`criterion ${expandedCriterion===c.id?'expanded':''}`}><button className="criterion-button" onClick={()=>setExpandedCriterion(expandedCriterion===c.id?null:c.id)} aria-expanded={expandedCriterion===c.id}><span className="criterion-number">{index+1}</span><strong>{c.label}</strong><span className={`criterion-status ${c.status}`}>{labels[c.status]}</span><Mark status={c.status}/></button>{expandedCriterion===c.id&&<div className="criterion-detail"><p>{c.detail}</p>{c.evidence.length>0?<div className="proof-links">{c.evidence.map(e=><button key={e.seq} onClick={()=>{const entry=view.journal.find(j=>j.seq===e.seq);if(entry)setDetail(entry);}}>Preuve #{e.seq}<ArrowRight size={11}/></button>)}</div>:<small>Les mesures ou preuves apparaissent à la fin de l’exécution.</small>}</div>}</div>)}</div>
              <div className="initiative-block"><h3>Agir à bon escient</h3><div><span>Initiatives utiles</span><strong>{view.evaluation.initiatives.useful}</strong></div><div><span>Occasions manquées</span><strong>{view.evaluation.initiatives.missed}</strong></div><div><span>Interventions inutiles</span><strong>{view.evaluation.initiatives.unnecessary}</strong></div><div><span>Violations critiques</span><strong className={view.evaluation.initiatives.critical?'failure-text':''}>{view.evaluation.initiatives.critical}</strong></div></div>
              <div className="test-note"><ShieldCheck size={17}/><p>Vérifié par du code.<small>Les tests inspectent le monde et le journal. Les déclarations de l’agent ne suffisent pas.</small></p></div>
            </aside></div>
            <Comparison runs={runs} selected={run.agent} onChoose={id=>choose(id)}/>
          </>}
        </>}
        <footer className="page-footer"><span>AGENA · prototype indépendant</span><span>Tout est fictif. Les tests, eux, s’exécutent réellement.</span><a href="https://github.com/mateozagar/Agena/blob/main/SPEC.md" target="_blank" rel="noreferrer">Lire la spécification<ArrowRight size={12}/></a></footer>
      </div>
    </main>
    {detail&&<EvidenceDrawer entry={detail} onClose={()=>setDetail(null)}/>}
  </div>;
}

function Timeline({run,total,onSelect}:{run:RunView;total:RunView;onSelect:(e:JournalEntry)=>void}){
  const entries=run.journal.filter(e=>e.kind==='world'||e.data.event==='crash-boundary'||e.kind==='report'&&e.data.success);
  return <div className="timeline-chart" aria-label="Frise de 30 jours"><div className="timeline-lanes"><span>Monde</span><span>Agent</span></div><div className="timeline-plot"><div className="timeline-progress" style={{width:`${(Date.parse(run.world.now)-START)/(30*DAY)*100}%`}}/>{Array.from({length:31},(_,i)=><div key={i} className={`day-tick ${i%5===0?'major':''}`} style={{left:`${i/30*100}%`}}><i/>{i%5===0&&<span>J{i.toString().padStart(2,'0')}</span>}</div>)}{entries.map(e=>{const crash=e.data.event==='crash-boundary';return <button key={e.seq} className={`timeline-event ${e.kind==='world'?'world':'agent'} ${crash?'crash':''}`} style={{left:`${Math.min(99,(Date.parse(e.virtualAt)-START)/(30*DAY)*100)}%`}} aria-label={`${date(e.virtualAt)} : ${e.title}`} title={e.title} onClick={()=>onSelect(e)}>{crash?<Zap size={12}/>:null}</button>;})}<div className="playhead" style={{left:`${Math.min(100,(Date.parse(run.world.now)-START)/(30*DAY)*100)}%`}}/>{total.status==='completed'&&run.journal.length===total.journal.length&&<span className="timeline-end"><Check size={10}/>Fin du scénario</span>}</div></div>;
}
function Comparison({runs,selected,onChoose}:{runs:Summary[];selected:AgentKind;onChoose:(id:string)=>void}){
  const reference=(kind:AgentKind)=>runs.find(r=>r.agent===kind&&r.status==='completed');
  const a=reference('persistent'), b=reference('simple');
  if(!a||!b)return null;
  const comparable=a.seed===b.seed;
  return <section className="comparison"><div className="panel-heading"><div><h2>Deux approches, les mêmes imprévus.</h2><p>{comparable?`Dernières exécutions terminées · graine ${a.seed}`:'Graines différentes : relancez les agents avec la même graine pour comparer.'}</p></div><span className="tag">Références scriptées</span></div><div className="comparison-scroll"><table><thead><tr><th>Agent</th>{a.evaluation.criteria.filter(c=>c.id!=='efficiency').map(c=><th key={c.id}>{c.label}</th>)}<th>Outils</th></tr></thead><tbody>{[a,b].map(r=><tr key={r.id} className={r.agent===selected?'selected':''}><th><button onClick={()=>onChoose(r.id)}>{r.agent==='persistent'?<MemoryStick size={15}/>:<Zap size={15}/>} {agentName(r.agent)}<ArrowRight size={13}/></button></th>{r.evaluation.criteria.filter(c=>c.id!=='efficiency').map(c=><td key={c.id}><span title={`${c.label} : ${labels[c.status]}`} aria-label={`${c.label} : ${labels[c.status]}`}><Mark status={c.status}/></span></td>)}<td className="number">{r.metrics.toolCalls}</td></tr>)}</tbody></table></div><p className="comparison-note">Ce scénario teste des comportements précis. Il ne mesure pas les performances de Claude, Dots, Hermes ou OpenClaw.</p></section>;
}
function EvidenceDrawer({entry,onClose}:{entry:JournalEntry;onClose:()=>void}){
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[onClose]);
  return <aside className="evidence-drawer" aria-label={`Preuve ${entry.seq}`}><div className="drawer-top"><span><ShieldCheck size={17}/>Preuve #{entry.seq}</span><button className="icon-button" onClick={onClose} autoFocus aria-label="Fermer la preuve"><X size={19}/></button></div><div className="drawer-body"><span className="tag">{entry.kind} · {date(entry.virtualAt,true)} UTC</span><h2>{entry.title}</h2><p>Enregistrement produit par le simulateur. Les données ci-dessous permettent de vérifier l’action ou l’observation.</p><pre>{JSON.stringify(entry.data,null,2)}</pre></div></aside>;
}
function WorldPanel({run,tab,setTab,replay}:{run:RunView;tab:string;setTab:(s:string)=>void;replay:boolean}){
  const w=run.world;
  return <><div className="page-heading"><div><h1>Une vie entièrement fictive.</h1><p>L’état {replay?'au point de lecture du replay':'courant du monde'} · {date(w.now,true)} UTC</p></div><span className="tag"><Database size={13}/>SQLite · effets persistés</span></div><div className="world-tabs tabs">{[['calendar','Calendrier',CalendarDays],['mail','Messagerie',Mail],['tasks','Tâches',CheckCircle2],['contacts','Contacts',Users],['memory','Mémoire',MemoryStick]].map(([id,title,Icon])=><button key={String(id)} className={tab===id?'chosen':''} onClick={()=>setTab(String(id))}>{typeof Icon!=='string'&&<Icon size={16}/>} {String(title)}</button>)}</div><section className="world-content">{tab==='calendar'&&<><div className="panel-heading"><h2>Les événements réellement créés</h2><span>{w.calendar.length} événement(s)</span></div>{w.calendar.length===0?<div className="empty">Le calendrier est vide à cet instant.</div>:w.calendar.map(m=><div className="calendar-event" key={m.id}><div className="calendar-date"><span>AVR.</span><strong>18</strong></div><div><h3>{m.title}</h3><p>{date(m.start,true)} UTC · {m.duration} minutes · {m.cost} €</p><small>{m.id} · objectif {m.goalId}</small></div><span className="tag">Créé le {date(m.createdAt)}</span></div>)}</>}{tab==='mail'&&<><div className="panel-heading"><h2>Boîte mail simulée</h2><span>{w.inbox.length} messages</span></div>{w.inbox.map(m=><article className="mail-row" key={m.id}><span className="mail-avatar">{m.from[0]}</span><div><div className="mail-meta"><strong>{m.from}</strong><time>{date(m.at,true)}</time></div><h3>{m.subject}</h3><p>{m.body}</p></div></article>)}</>}{tab==='tasks'&&<><h2>Liste de tâches</h2>{w.tasks.map(t=><div className="task-row" key={t.id}>{t.done?<CheckCircle2 className="success-text" size={22}/>:<Circle size={22}/>}<div><strong>{t.title}</strong><p>{t.done?'Marquée terminée par l’agent. La réussite est vérifiée séparément.':'En attente d’exécution.'}</p></div></div>)}<div className="permissions"><h3>Autorisations et contraintes</h3><p>Calendrier : {w.permission.calendar?'autorisé':'attendre la validation'} · Messages : {w.permission.messages?'autorisés':'non autorisés'}</p><p>Budget : {w.spent} € dépensés sur {w.budget} €.</p><p>Préférence actuelle : {w.preference.value==='morning'?'le matin':'l’après-midi'} · version {w.preference.version}.</p></div></>}{tab==='contacts'&&<><h2>Carnet de contacts fictif</h2>{w.contacts.map(c=><div className="contact-row" key={c.id}><span className="agent-avatar">{c.name[0]}</span><div><strong>{c.name}</strong><p>{c.email}</p></div><span className="tag">Personne fictive</span></div>)}</>}{tab==='memory'&&<><div className="panel-heading"><h2>Souvenirs persistés</h2><span>{run.memories.length} entrées actives</span></div><p className="section-description">Ce sont des données enregistrées et relues, pas une pensée interne de l’agent.</p>{run.memories.length===0?<div className="empty">Cet agent n’a enregistré aucun souvenir persistant.</div>:run.memories.map(m=><article className="memory-row" key={m.key}><MemoryStick size={18}/><div><h3>{m.key} <span className="tag">v{m.version}</span></h3><code>{JSON.stringify(m.value)}</code><p>Source : {m.source}</p></div></article>)}</>}</section></>;
}
function Method(){
  return <article className="method"><h1>Des preuves, avant les promesses.</h1><p className="method-lead">AGENA observe un agent pendant un mois de vie fictive. Chaque événement modifie un vrai état logiciel ; chaque réussite doit laisser une trace vérifiable.</p><section><h2>Trois temps, trois usages.</h2><div className="method-columns"><div><Clock3 size={23}/><h3>Le temps simulé</h3><p>L’horloge saute au prochain message, réveil ou délai. Les jours sans activité ne coûtent pas des jours d’attente.</p></div><div><Activity size={23}/><h3>Le temps de calcul</h3><p>Le temps réellement utilisé par le moteur et les processus agents. Les pauses et le ralentissement de présentation en sont exclus.</p></div><div><RotateCcw size={23}/><h3>Le temps de lecture</h3><p>Un replay accéléré lit des traces déjà enregistrées. Il n’exécute aucun agent et ne change aucun résultat.</p></div></div><p>L’objectif « 30 jours en 5 minutes » concerne la démonstration. Le coût et la durée d’un vrai modèle dépendront de ses décisions et de ses appels.</p></section><section><h2>Ce qui arrive à Léa et Milo</h2><ol><li>Léa demande une réunion. Toute création attend son autorisation.</li><li>Sa préférence passe du matin à l’après-midi. Milo devient indisponible le matin.</li><li>L’autorisation arrive. L’agent peut réserver un créneau conforme.</li><li>Après l’écriture du rendez-vous, le processus est tué avant de recevoir la confirmation.</li><li>Au redémarrage, il doit retrouver la réservation. Un dossier reçu plus tard lui donne une occasion utile d’agir.</li><li>Un échec temporaire d’envoi vérifie qu’il ne prétend pas avoir réussi.</li></ol></section><section><h2>Deux références, explicitement scriptées.</h2><p>L’agent réactif conserve peu d’état et ne réconcilie pas les actions après un crash. L’agent avec mémoire enregistre ses informations, relit le calendrier et programme des réveils. Leurs politiques sont écrites à la main pour éprouver le simulateur et son évaluateur.</p><p>Un résultat positif ne prouve pas qu’un modèle général réussirait. Claude Duet, Dots, Hermes, OpenClaw et les autres véritables agents restent à connecter via un adaptateur. Aucun appel modèle n’est effectué ici.</p></section><section><h2>Comment les tests décident</h2><p>L’évaluateur inspecte les objets du monde et leur journal : présence réelle du rendez-vous, horaires, participants, permission, budget, délais et doublons. Il accepte plusieurs créneaux valides. Les déclarations de réussite ne remplacent jamais un effet.</p><p>Les huit critères restent séparés. Les initiatives utiles, les occasions manquées, les interventions inutiles et les violations critiques sont comptées séparément. Aucun juge LLM ni score global n’est utilisé.</p><a className="button secondary" href="https://github.com/mateozagar/Agena" target="_blank" rel="noreferrer"><GitBranch size={15}/>Reproduire les tests<ArrowRight size={14}/></a></section><section><h2>Pourquoi cette simulation du temps ?</h2><p>La vidéo <a href="https://youtu.be/9t2fV52jMA8?t=137" target="_blank" rel="noreferrer">Running Minecraft Until It Beats Itself</a> décrit une compression des périodes ordinaires en délais échantillonnés. AGENA utilise ce principe pour les événements, avec une graine enregistrée pour les imprévus, sans simuler chaque seconde.</p><p className="section-description">Référence consultée via ses sous-titres automatiques anglais. AGENA ne reproduit pas le simulateur Minecraft.</p></section></article>;
}
