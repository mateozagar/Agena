import type { RunView, Memory, Meeting, Json, WorldEvent } from "./types.ts";
import { initialWorld, applyEvent } from "../server/scenario.ts";

/** Read-only projection of committed evidence, with no future-state leakage. */
export function replayAt(run: RunView, seq: number): RunView {
  const journal = run.journal.filter((e) => e.seq <= seq);
  const memories: Memory[] = [];
  const world = initialWorld();
  for (const entry of journal) {
    world.now = entry.virtualAt;
    if (entry.kind === "world")
      applyEvent(world, {
        id: String(entry.data.eventId),
        at: entry.virtualAt,
        kind: entry.data.eventKind as WorldEvent["kind"],
        title: entry.title,
        data: entry.data,
      });
    if (entry.kind === "memory") {
      const memory = {
        key: String(entry.data.key),
        value: entry.data.value!,
        version: Number(entry.data.version),
        source: String(entry.data.source),
      };
      const index = memories.findIndex((m) => m.key === memory.key);
      if (index < 0) memories.push(memory);
      else memories[index] = memory;
    }
    if (entry.kind !== "tool") continue;
    if (entry.data.committed && entry.data.ok && entry.data.eventId) {
      const meeting = entry.data.result as unknown as Meeting;
      const index = world.calendar.findIndex((m) => m.id === meeting.id);
      if (index < 0) world.calendar.push(meeting);
      else world.calendar[index] = meeting;
      world.spent = world.calendar.reduce((sum, m) => sum + m.cost, 0);
    }
    if (entry.data.name === "task.complete" && entry.data.ok) {
      const task = world.tasks.find(
        (t) => t.id === (entry.data.args as Record<string, Json>).id,
      );
      if (task) {
        task.done = true;
        task.completedAt = entry.virtualAt;
      }
    }
    if (entry.data.name === "mail.send") {
      if (entry.data.error === "TEMPORARY_MAIL_FAILURE")
        world.mailFailureRemaining--;
      if (entry.data.ok && entry.data.sent) {
        if (entry.data.useful) world.reminderSent = true;
        const args = entry.data.args as Record<string, Json>;
        world.inbox.push({
          id: `sent-${entry.seq - 1}`,
          from: "Agent → Milo",
          subject: String(args.subject),
          body: String(args.body),
          at: entry.virtualAt,
          kind: "reminder",
        });
      }
    }
  }
  const atEnd = seq >= run.journal.length;
  return {
    ...run,
    journal,
    memories,
    world,
    metrics: {
      ...run.metrics,
      toolCalls: journal.filter((entry) => entry.kind === "tool").length,
      processes: journal.filter((entry) => entry.data.event === "spawn").length,
    },
    evaluation: atEnd
      ? run.evaluation
      : {
          ...run.evaluation,
          criteria: run.evaluation.criteria.map((c) => ({
            ...c,
            status: "pending",
            detail: "Résultat disponible à la fin du replay.",
            evidence: [],
          })),
          initiatives: {
            useful: world.reminderSent ? 1 : 0,
            missed: 0,
            unnecessary: 0,
            critical: 0,
          },
        },
  };
}
