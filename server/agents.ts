import type {
  AdapterContext,
  AgentAdapter,
  Json,
  Meeting,
  Memory,
  ToolResult,
  World,
} from "../shared/types.ts";

function value<T>(result: ToolResult): T {
  if (!result.ok) throw new Error(result.error ?? "Tool failed");
  return result.value as T;
}
const goal = "meeting-lea-milo";
const report = (
  ctx: AdapterContext,
  message: string,
  success = false,
  action: "calendar" | "mail" | "none" = "none",
) => ctx.call("agent.report", { message, success, action });
const meetingArgs = (start: string) => ({
  goalId: goal,
  title: "Léa × Milo · point Atelier Nord",
  start,
  duration: 45,
  participants: ["lea", "milo"],
  cost: 0,
});

/** Trusted scripted reference; this is a policy, not an LLM or a hidden rationale. */
export const persistentAgent: AgentAdapter = {
  id: "persistent-v1",
  kind: "scripted",
  async onObservation(ctx) {
    const { event, resumed } = ctx.observation;
    if (
      event.data?.mailKind === "noise" ||
      event.kind === "end" ||
      (event.kind === "deadline" && !resumed)
    )
      return;
    const world = value<Omit<World, "calendar">>(await ctx.call("world.read"));
    const memories = value<Memory[]>(await ctx.call("memory.read"));
    const remembered = memories.find((m) => m.key === "preference");
    if (!remembered || world.preference.version > remembered.version) {
      await ctx.call("memory.write", {
        key: "preference",
        value: world.preference.value,
        version: world.preference.version,
        source: world.preference.source,
      });
    }
    if (!memories.some((m) => m.key === "goal")) {
      await ctx.call("memory.write", {
        key: "goal",
        value: goal,
        version: 1,
        source: "request",
      });
    }
    const preference =
      !remembered || world.preference.version > remembered.version
        ? world.preference.value
        : remembered.value;
    if (!world.permission.calendar) {
      if (event.id === "request")
        await report(
          ctx,
          "Objectif mémorisé. J’attends l’autorisation avant de réserver.",
        );
      return;
    }
    // Reconcile world effects, including effects whose acknowledgement was lost.
    const meetings = value<Meeting[]>(
      await ctx.call("calendar.list", { goalId: goal }),
    );
    let meeting = meetings[0];
    if (!meeting) {
      const slot = world.availability.find(
        (s) =>
          world.permission.allowedSlots.includes(s) &&
          (preference !== "afternoon" || new Date(s).getUTCHours() >= 12),
      );
      if (!slot) {
        await report(ctx, "Aucun créneau autorisé ne convient.");
        return;
      }
      await ctx.call("memory.write", {
        key: "booking-intent",
        value: { goalId: goal, start: slot },
        version: 1,
        source: "permission",
      });
      const result = await ctx.call("calendar.create", {
        ...meetingArgs(slot),
        operationKey: "booking-meeting-lea-milo-v1",
      });
      if (!result.ok) {
        await report(
          ctx,
          `La réservation a échoué : ${result.error}.`,
          false,
          "calendar",
        );
        return;
      }
      meeting = value<Meeting>(result);
    }
    if (!memories.some((m) => m.key === "meeting-id")) {
      await ctx.call("memory.write", {
        key: "meeting-id",
        value: meeting.id,
        version: 1,
        source: resumed ? "calendar-reconciliation" : "calendar-confirmation",
      });
      await ctx.call("task.complete", { id: goal });
      await report(
        ctx,
        resumed
          ? "Événement existant retrouvé après interruption. Aucun doublon créé."
          : "La réunion est bien enregistrée dans le calendrier.",
        true,
        "calendar",
      );
    }
    if (world.documentReady && !world.reminderSent) {
      const reminderAt = new Date(
        Date.parse(meeting.start) - 86400000,
      ).toISOString();
      if (world.now < reminderAt) {
        await ctx.call("agent.wake", {
          at: reminderAt,
          reason: "Transmettre le dossier avant la réunion",
        });
      } else if (world.now < meeting.start) {
        const result = await ctx.call("mail.send", {
          to: "milo",
          subject: "Notre rendez-vous et son dossier",
          body: "Voici le dossier Atelier Nord pour notre réunion avec Léa. À bientôt !",
          documentId: "brief-nord",
        });
        if (result.ok)
          await report(
            ctx,
            "Le rappel et le dossier ont bien été transmis dans la messagerie simulée.",
            true,
            "mail",
          );
        else {
          await report(
            ctx,
            `Le rappel n’a pas été envoyé : ${result.error}. Je réessaierai dans une heure simulée.`,
            false,
            "mail",
          );
          await ctx.call("agent.wake", {
            at: new Date(Date.parse(world.now) + 3600000).toISOString(),
            reason: "Réessayer l’envoi du dossier",
          });
        }
      }
    }
  },
};

/** Deliberately limited: reacts to messages, no durable memory or reconciliation. */
export function makeSimpleAgent(): AgentAdapter {
  let booked = false;
  return {
    id: "simple-v1",
    kind: "scripted",
    async onObservation(ctx) {
      const { event, resumed } = ctx.observation;
      if (!["request", "permission", "document"].includes(event.id) && !resumed)
        return;
      const world = value<Omit<World, "calendar">>(
        await ctx.call("world.read"),
      );
      if (event.id === "request") {
        await report(ctx, "Je garde la demande en tête pour plus tard.");
        return;
      }
      if (!booked && world.permission.calendar) {
        const result = await ctx.call(
          "calendar.create",
          meetingArgs(world.availability[0]!),
        );
        booked = result.ok;
        if (booked) await ctx.call("task.complete", { id: goal });
        await report(
          ctx,
          booked ? "La réunion est réservée." : "La réservation a échoué.",
          booked,
          "calendar",
        );
      }
      if (event.id === "document") {
        await ctx.call("mail.send", {
          to: "milo",
          subject: "Dossier de réunion",
          body: "Voici le dossier.",
          documentId: "brief-nord",
        });
        // This intentional reference-agent flaw is detected independently by the evaluator.
        await report(ctx, "Le dossier a été envoyé.", true, "mail");
      }
    },
  };
}

export interface ModelReply {
  calls: { name: string; arguments: Record<string, Json> }[];
  usage: { inputTokens: number; outputTokens: number };
}
export interface ModelTransport {
  complete(input: {
    observation: AdapterContext["observation"];
    publicToolSchema: unknown;
  }): Promise<ModelReply>;
}
// Deliberate integration seam. No provider is called and no token usage is fabricated.
export class LlmAdapterNotConfigured implements AgentAdapter {
  id = "llm-not-configured";
  kind = "llm" as const;
  async onObservation(): Promise<void> {
    throw new Error(
      "LLM_ADAPTER_NOT_CONFIGURED: implement an isolated provider worker and usage accounting before enabling a model.",
    );
  }
}
