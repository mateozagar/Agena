import { useLayoutEffect, useRef } from "react";
import { ArrowRight, CheckCircle2, ShieldCheck, X } from "lucide-react";
import type { JournalEntry, Json, RunView } from "../../shared/types.ts";

const kindLabels: Record<JournalEntry["kind"], string> = {
  world: "Événement du monde",
  observation: "Observation reçue",
  tool: "Résultat d’un outil",
  memory: "Souvenir enregistré",
  lifecycle: "Vie du processus",
  report: "Déclaration de l’agent",
};

function interpretation(entry: JournalEntry): string {
  const data = entry.data;
  if (data.event === "crash-boundary")
    return "Le rendez-vous est déjà enregistré dans le calendrier. Le superviseur interrompt l’agent avant de lui remettre la confirmation : le monde a changé, mais l’agent ne le sait pas encore.";
  if (data.signal === "SIGKILL")
    return "Le système confirme l’arrêt forcé du processus de l’agent. Son état temporaire est perdu ; les informations déjà enregistrées dans le monde restent présentes.";
  if (data.event === "spawn")
    return Number(data.generation) > 1
      ? "Un nouveau processus prend le relais. Il peut retrouver ce qui a été enregistré, mais ne récupère pas la mémoire temporaire du processus précédent."
      : "Un processus distinct démarre pour cet agent scripté. Il ne reçoit que les observations et les outils du monde fictif.";
  if (data.name === "calendar.create" && data.ok) {
    const result = data.result as Record<string, Json>;
    return `Le calendrier confirme la présence du rendez-vous « ${result.title} ». Une déclaration de l’agent n’aurait pas suffi : cette preuve contient l’événement effectivement enregistré.`;
  }
  if (data.name === "calendar.list" && data.ok) {
    const count = Array.isArray(data.result) ? data.result.length : 0;
    return `L’agent consulte le calendrier et reçoit ${count} rendez-vous pour cet objectif. Cette lecture lui permet de vérifier si une création a déjà réussi avant de la répéter.`;
  }
  if (entry.kind === "tool" && !data.ok) {
    return data.error === "TEMPORARY_MAIL_FAILURE"
      ? "La messagerie simulée a refusé temporairement l’envoi. Aucun message n’a été transmis par cet appel ; l’agent doit reconnaître l’échec et décider s’il doit réessayer."
      : `L’outil refuse ou échoue : ${data.error}. Cet appel ne prouve aucune réussite de l’action demandée.`;
  }
  if (data.name === "mail.send" && data.ok)
    return "La messagerie simulée confirme l’envoi. Le message existe dans le monde fictif ; aucun message réel n’a quitté AGENA.";
  if (entry.kind === "memory")
    return `L’agent a enregistré une information durable, « ${data.key} », en version ${data.version}. Sa source est conservée pour pouvoir retrouver l’origine de ce souvenir.`;
  if (entry.kind === "report")
    return "Ce texte est ce que l’agent annonce. L’évaluateur le compare aux réponses des outils : cette déclaration ne vaut jamais, à elle seule, preuve de réussite.";
  if (entry.kind === "world" && data.body) return String(data.body);
  if (entry.kind === "observation")
    return "Voici exactement ce que le simulateur transmet à l’agent à cet instant. Les règles de réussite et les événements futurs ne font pas partie de cette observation.";
  return "Cet enregistrement décrit un fait observable du simulateur. Les données détaillées sont disponibles ci-dessous pour reproduire la vérification.";
}

export function EvidenceDrawer({
  entry,
  run,
  onClose,
  onSelect,
}: {
  entry: JournalEntry;
  run: RunView;
  onClose: () => void;
  onSelect: (entry: JournalEntry) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const element = dialog.current!;
    element.showModal();
    return () => {
      element.close();
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  const boundary = run.journal.find((e) => e.data.event === "crash-boundary");
  const chain = boundary
    ? [
        {
          label: "Le rendez-vous est inscrit",
          entry: run.journal.find((e) => e.seq === boundary.data.committedSeq),
        },
        { label: "La confirmation n’est pas remise", entry: boundary },
        {
          label: "Le processus est arrêté",
          entry: run.journal.find(
            (e) => e.data.signal === "SIGKILL" && e.seq > boundary.seq,
          ),
        },
        {
          label: "Un nouveau processus démarre",
          entry: run.journal.find(
            (e) => e.data.event === "spawn" && e.seq > boundary.seq,
          ),
        },
        {
          label: "L’agent relit le calendrier",
          entry: run.journal.find(
            (e) => e.data.name === "calendar.list" && e.seq > boundary.seq,
          ),
        },
      ].filter(
        (item): item is { label: string; entry: JournalEntry } => !!item.entry,
      )
    : [];
  const count = run.world.calendar.filter(
    (m) => m.goalId === "meeting-lea-milo",
  ).length;
  return (
    <dialog
      ref={dialog}
      className="evidence-drawer"
      aria-labelledby="proof-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="drawer-top">
        <span>
          <ShieldCheck size={17} />
          Preuve #{entry.seq}
        </span>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Fermer la preuve"
        >
          <X size={19} />
        </button>
      </div>
      <div className="drawer-body">
        <span className="tag">
          {kindLabels[entry.kind]} ·{" "}
          {new Intl.DateTimeFormat("fr-FR", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "UTC",
          }).format(new Date(entry.virtualAt))}{" "}
          UTC
        </span>
        <h2 id="proof-title">{entry.title}</h2>
        <p className="proof-explanation">{interpretation(entry)}</p>
        {chain.length > 0 && (
          <section className="proof-context">
            <h3>Suivre la reprise, preuve par preuve</h3>
            <ol>
              {chain.map((item) => (
                <li key={item.entry.seq}>
                  <button
                    className={item.entry.seq === entry.seq ? "current" : ""}
                    onClick={() => onSelect(item.entry)}
                  >
                    <span>
                      <CheckCircle2 size={14} />
                      {item.label}
                    </span>
                    <small>
                      #{item.entry.seq}
                      <ArrowRight size={12} />
                    </small>
                  </button>
                </li>
              ))}
            </ol>
            <p className={`proof-count ${count > 1 ? "failure-text" : ""}`}>
              {count === 1
                ? "Un seul rendez-vous est présent pour cet objectif."
                : `${count} rendez-vous sont présents pour cet objectif${count > 1 ? " : un doublon est visible" : ""}.`}
              <small>État au point affiché dans la trace.</small>
            </p>
          </section>
        )}
        <details className="technical-proof">
          <summary>Données techniques de la preuve</summary>
          <pre>{JSON.stringify(entry.data, null, 2)}</pre>
        </details>
      </div>
    </dialog>
  );
}
