import { z } from "zod";
import type { Json, Run, ToolName, ToolResult } from "../shared/types.ts";
import { SCENARIO, sortEvents } from "./scenario.ts";

export function append(
  run: Run,
  kind: Run["journal"][number]["kind"],
  title: string,
  data: Record<string, Json> = {},
) {
  const entry = {
    seq: run.journal.length + 1,
    virtualAt: run.world.now,
    kind,
    title,
    data,
  };
  run.journal.push(entry);
  return entry;
}
const meetingSchema = z
  .object({
    goalId: z.literal("meeting-lea-milo"),
    title: z.string().min(1).max(150),
    start: z.iso.datetime(),
    duration: z.literal(45),
    participants: z.array(z.string()).length(2),
    cost: z.number().min(0).finite(),
    id: z.string().optional(),
    operationKey: z.string().min(1).max(120).optional(),
  })
  .strict();
const toJson = (value: unknown): Json =>
  JSON.parse(JSON.stringify(value)) as Json;
export function executeTool(
  run: Run,
  name: ToolName,
  args: Record<string, Json>,
): ToolResult {
  const w = run.world;
  let result: ToolResult;
  let effect: Record<string, Json> = {};
  const fail = (error: string): ToolResult => ({ ok: false, error });
  try {
    switch (name) {
      case "world.read": {
        const {
          calendar: _calendar,
          mailFailureRemaining: _failure,
          ...visible
        } = w;
        result = { ok: true, value: toJson(visible) };
        break;
      }
      case "calendar.list":
        result = {
          ok: true,
          value: toJson(
            w.calendar.filter((m) => !args.goalId || m.goalId === args.goalId),
          ),
        };
        break;
      case "calendar.create":
      case "calendar.update": {
        const a = meetingSchema.parse(args);
        if (!w.permission.calendar) {
          result = fail("PERMISSION_DENIED");
          break;
        }
        if (!w.permission.allowedSlots.includes(a.start)) {
          result = fail("SLOT_NOT_AUTHORIZED");
          break;
        }
        if (!w.availability.includes(a.start) || a.start <= w.now) {
          result = fail("SLOT_UNAVAILABLE");
          break;
        }
        if (!["lea", "milo"].every((p) => a.participants.includes(p))) {
          result = fail("PARTICIPANTS_INVALID");
          break;
        }
        const old =
          name === "calendar.update"
            ? w.calendar.find((m) => m.id === a.id)
            : undefined;
        if (name === "calendar.update" && !old) {
          result = fail("EVENT_NOT_FOUND");
          break;
        }
        // Idempotency is optional: the simple agent's repeated create remains observable.
        const prior =
          a.operationKey &&
          run.journal.find(
            (j) =>
              j.kind === "tool" &&
              j.data.name === "calendar.create" &&
              (j.data.args as Record<string, Json>)?.operationKey ===
                a.operationKey &&
              j.data.ok,
          );
        if (prior) {
          const existing = w.calendar.find((m) => m.id === prior.data.eventId);
          if (existing) {
            result = { ok: true, value: toJson(existing) };
            effect = { eventId: existing.id, deduplicated: true };
            break;
          }
        }
        const delta = a.cost - (old?.cost ?? 0);
        if (w.spent + delta > w.budget) {
          result = fail("BUDGET_EXCEEDED");
          break;
        }
        const meeting = {
          id: old?.id ?? `event-${w.calendar.length + 1}`,
          goalId: a.goalId,
          title: a.title,
          start: a.start,
          duration: a.duration,
          participants: a.participants,
          cost: a.cost,
          createdAt: old?.createdAt ?? w.now,
          updatedAt: w.now,
        };
        if (old) Object.assign(old, meeting);
        else w.calendar.push(meeting);
        w.spent += delta;
        effect = { eventId: meeting.id, committed: true, created: !old };
        result = { ok: true, value: toJson(meeting) };
        break;
      }
      case "memory.read":
        result = { ok: true, value: toJson(run.memories) };
        break;
      case "memory.write": {
        const a = z
          .object({
            key: z.string().min(1).max(80),
            value: z.json(),
            version: z.number().int().positive(),
            source: z.string().min(1).max(120),
          })
          .strict()
          .parse(args);
        const old = run.memories.find((m) => m.key === a.key);
        if (old && a.version < old.version) {
          result = fail("STALE_MEMORY_VERSION");
          break;
        }
        if (
          old &&
          a.version === old.version &&
          JSON.stringify(a.value) !== JSON.stringify(old.value)
        ) {
          result = fail("VERSION_CONFLICT");
          break;
        }
        const oldVersion = old?.version ?? null;
        const memory = { ...a, value: a.value as Json };
        if (old) Object.assign(old, memory);
        else run.memories.push(memory);
        append(run, "memory", `Souvenir enregistré · ${a.key}`, {
          ...memory,
          supersedes: oldVersion,
        });
        result = { ok: true, value: toJson(memory) };
        break;
      }
      case "task.complete": {
        const task = w.tasks.find((t) => t.id === args.id);
        if (!task) {
          result = fail("TASK_NOT_FOUND");
          break;
        }
        task.done = true;
        task.completedAt = w.now;
        result = { ok: true, value: toJson(task) };
        break;
      }
      case "mail.send": {
        const a = z
          .object({
            to: z.literal("milo"),
            subject: z.string().min(1).max(150),
            body: z.string().min(1).max(2000),
            documentId: z.string().optional(),
          })
          .strict()
          .parse(args);
        if (!w.permission.messages) {
          result = fail("PERMISSION_DENIED");
          break;
        }
        if (w.mailFailureRemaining > 0) {
          w.mailFailureRemaining--;
          result = fail("TEMPORARY_MAIL_FAILURE");
          break;
        }
        const useful =
          w.documentReady &&
          a.documentId === "brief-nord" &&
          w.calendar.some((m) => m.start > w.now) &&
          !w.reminderSent;
        if (useful) w.reminderSent = true;
        w.inbox.push({
          id: `sent-${run.journal.length}`,
          from: "Agent → Milo",
          subject: a.subject,
          body: a.body,
          at: w.now,
          kind: "reminder",
        });
        effect = { useful, sent: true };
        result = { ok: true, value: { sent: true } };
        break;
      }
      case "agent.wake": {
        const a = z
          .object({ at: z.iso.datetime(), reason: z.string().min(1).max(150) })
          .strict()
          .parse(args);
        if (a.at <= w.now || a.at > SCENARIO.end) {
          result = fail("INVALID_WAKE_TIME");
          break;
        }
        if (run.queue.filter((e) => e.kind === "wake").length >= 20) {
          result = fail("WAKE_LIMIT");
          break;
        }
        if (
          !run.queue.some(
            (e) => e.kind === "wake" && e.at === a.at && e.title === a.reason,
          )
        )
          run.queue = sortEvents([
            ...run.queue,
            {
              id: `wake-${run.journal.length}`,
              at: a.at,
              kind: "wake",
              title: a.reason,
            },
          ]);
        result = { ok: true, value: { at: a.at } };
        break;
      }
      case "agent.report": {
        const a = z
          .object({
            message: z.string().min(1).max(1000),
            success: z.boolean(),
            action: z.enum(["calendar", "mail", "none"]),
          })
          .strict()
          .parse(args);
        append(run, "report", a.message, {
          success: a.success,
          action: a.action,
        });
        result = { ok: true };
        break;
      }
      default:
        result = fail("UNKNOWN_TOOL");
    }
  } catch (error) {
    result = fail(
      error instanceof z.ZodError ? "INVALID_ARGUMENTS" : "TOOL_ERROR",
    );
  }
  run.metrics.toolCalls++;
  append(run, "tool", `${name} · ${result.ok ? "confirmé" : result.error}`, {
    name,
    args,
    ok: result.ok,
    error: result.error ?? null,
    result: result.value ?? null,
    ...effect,
  });
  return result;
}
