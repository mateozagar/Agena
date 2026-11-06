import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.ts";
import { Arena } from "../server/arena.ts";
import { evaluate } from "../server/evaluator.ts";
import { executeTool } from "../server/world.ts";
import { replayAt } from "../shared/replay.ts";
import { SCENARIO, SLOTS } from "../server/scenario.ts";
import { createApp } from "../server/api.ts";
import type { Run, RunView } from "../shared/types.ts";

async function withArena(fn: (arena: Arena, store: Store) => Promise<void>) {
  const store = new Store(":memory:");
  const arena = new Arena(store);
  try {
    await fn(arena, store);
  } finally {
    await arena.close();
    store.close();
  }
}

test("repeating the same seed repeats the world, effects, metrics counts and verdicts", async () =>
  withArena(async (arena, store) => {
    const a = arena.create("persistent", 842, true);
    await arena.finish(a.id);
    const b = arena.create("persistent", 842, true);
    await arena.finish(b.id);
    const first = store.get(a.id)!,
      second = store.get(b.id)!;
    assert.deepEqual(first.world, second.world);
    assert.deepEqual(first.memories, second.memories);
    assert.deepEqual(
      first.journal.filter((e) => e.kind === "world"),
      second.journal.filter((e) => e.kind === "world"),
    );
    assert.deepEqual(
      evaluate(first).criteria.map((c) => c.status),
      evaluate(second).criteria.map((c) => c.status),
    );
    assert.equal(first.metrics.toolCalls, second.metrics.toolCalls);
  }));

test("pause is acknowledged at a turn boundary and resume does not skip an event", async () =>
  withArena(async (arena, store) => {
    const run = arena.create("persistent", 42, true);
    const completion = arena.finish(run.id, 50);
    await arena.pause(run.id);
    await completion;
    const paused = store.get(run.id)!;
    assert.equal(paused.status, "paused");
    const length = paused.journal.length;
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(store.get(run.id)!.journal.length, length);
    await arena.finish(run.id);
    assert.equal(store.get(run.id)!.status, "completed");
    assert.equal(store.get(run.id)!.world.calendar.length, 1);
  }));

test("a paused simulation and durable memory survive reopening the SQLite store", async () => {
  const dir = mkdtempSync(join(tmpdir(), "agena-test-"));
  const path = join(dir, "test.db");
  let store = new Store(path);
  let arena = new Arena(store);
  try {
    const run = arena.create("persistent", 42, true);
    const promise = arena.finish(run.id, 10);
    await arena.pause(run.id);
    await promise;
    await arena.close();
    store.close();
    store = new Store(path);
    arena = new Arena(store);
    await arena.finish(run.id);
    const restored = store.get(run.id)!;
    assert.equal(restored.status, "completed");
    assert.equal(restored.world.calendar.length, 1);
    assert.equal(
      restored.memories.find((m) => m.key === "preference")?.value,
      "afternoon",
    );
  } finally {
    await arena.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("replay is read-only, reveals no future event, and reconstructs the final world exactly", async () =>
  withArena(async (arena, store) => {
    const r = arena.create("persistent", 42, true);
    await arena.finish(r.id);
    const run = store.get(r.id)!;
    const view: RunView = { ...run, evaluation: evaluate(run) };
    const before = JSON.stringify(run);
    const initial = replayAt(view, 1);
    assert.equal(initial.world.inbox.length, 0);
    assert.equal(initial.world.permission.calendar, false);
    assert.equal(initial.world.preference.value, "morning");
    assert.equal(initial.world.availability.length, 3);
    assert.equal(initial.metrics.toolCalls, 0);
    const crash = run.journal.find((e) => e.data.event === "crash-boundary")!;
    const atCrash = replayAt(view, crash.seq);
    assert.equal(atCrash.world.calendar.length, 1);
    assert.equal(
      atCrash.memories.some((m) => m.key === "meeting-id"),
      false,
    );
    assert.equal(atCrash.world.documentReady, false);
    assert.equal(
      atCrash.metrics.toolCalls,
      atCrash.journal.filter((e) => e.kind === "tool").length,
    );
    assert.ok(atCrash.metrics.toolCalls < run.metrics.toolCalls);
    assert.equal(atCrash.evaluation.criteria[0]!.status, "pending");
    const end = replayAt(view, run.journal.length);
    assert.deepEqual(end.world, run.world);
    assert.deepEqual(end.memories, run.memories);
    assert.equal(end.metrics.toolCalls, run.metrics.toolCalls);
    assert.equal(JSON.stringify(store.get(r.id)), before);
  }));

test("a valid alternative slot and an idempotent retry are accepted", async () =>
  withArena(async (arena) => {
    const r = arena.create("persistent", 42, false);
    r.world.now = "2030-04-11T12:00:00.000Z";
    r.world.permission = {
      calendar: true,
      messages: true,
      allowedSlots: SLOTS.slice(1),
    };
    r.world.preference = {
      value: "afternoon",
      version: 2,
      source: "preference-v2",
    };
    executeTool(r, "world.read", {});
    // Retaining a retrieved preference across time is a valid strategy too.
    r.world.now = "2030-04-12T12:00:00.000Z";
    const args = {
      goalId: SCENARIO.goalId,
      title: "Autre stratégie valide",
      start: SLOTS[2]!,
      duration: 45,
      participants: ["milo", "lea"],
      cost: 20,
      operationKey: "stable-intent",
    };
    const result = executeTool(r, "calendar.create", args);
    const retry = executeTool(r, "calendar.create", args);
    assert.equal(result.ok, true);
    assert.deepEqual(retry.value, result.value);
    assert.equal(r.world.calendar.length, 1);
    assert.equal(r.world.spent, 20);
    executeTool(r, "task.complete", { id: SCENARIO.goalId });
    r.status = "completed";
    const evaluation = evaluate(r);
    assert.equal(
      evaluation.criteria.find((c) => c.id === "execution")!.status,
      "pass",
    );
    assert.equal(
      evaluation.criteria.find((c) => c.id === "constraints")!.status,
      "pass",
    );
    assert.equal(
      evaluation.criteria.find((c) => c.id === "memory")!.status,
      "pass",
    );
    r.world.now = "2030-04-18T14:30:00.000Z";
    r.world.documentReady = true;
    r.world.mailFailureRemaining = 0;
    executeTool(r, "mail.send", {
      to: "milo",
      subject: "Dossier avant notre réunion de 15 h",
      body: "Voici le dossier.",
      documentId: "brief-nord",
    });
    assert.equal(
      evaluate(r).criteria.find((c) => c.id === "proactivity")!.status,
      "pass",
    );
    assert.equal(
      evaluation.criteria.find((c) => c.id === "recovery")!.status,
      "not_tested",
    );
  }));

test("state without journal proof, late completion, and arbitrary success claims do not pass", async () =>
  withArena(async (arena, store) => {
    const r = arena.create("persistent", 42, false);
    await arena.finish(r.id);
    const original = store.get(r.id)!;
    const forged = structuredClone(original);
    forged.journal = forged.journal.filter((e) => !e.data.committed);
    assert.equal(
      evaluate(forged).criteria.find((c) => c.id === "execution")!.status,
      "fail",
    );
    const late = structuredClone(original);
    late.world.calendar[0]!.createdAt = "2030-04-16T10:00:00.000Z";
    assert.equal(
      evaluate(late).criteria.find((c) => c.id === "execution")!.status,
      "fail",
    );
    executeTool(original, "agent.report", {
      message: "Tout a réussi",
      success: true,
      action: "none",
    });
    assert.equal(
      evaluate(original).criteria.find((c) => c.id === "transparency")!.status,
      "fail",
    );
  }));

test("agent observations contain no future event queue or evaluation rules", async () =>
  withArena(async (arena, store) => {
    const r = arena.create("persistent", 42, true);
    await arena.finish(r.id);
    const run = store.get(r.id)!;
    const initial = run.journal.find((e) => e.kind === "observation")!;
    const text = JSON.stringify(initial.data);
    assert.ok(!text.includes("preference-v2"));
    assert.ok(!text.includes("mailFailureRemaining"));
    assert.ok(!text.includes("queue"));
    assert.ok(!text.includes("criteria"));
    const read = run.journal.find((e) => e.data.name === "world.read")!;
    const result = read.data.result as Record<string, unknown>;
    assert.ok(!("calendar" in result));
    assert.ok(!("mailFailureRemaining" in result));
    assert.equal(run.world.now, SCENARIO.end);
  }));

test("HTTP API starts a real run, validates config and exports stored evidence", async () =>
  withArena(async (arena) => {
    const server = createApp(arena).listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    try {
      const invalid = await fetch(`${base}/api/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent: "untrusted-executable" }),
      });
      assert.equal(invalid.status, 400);
      const response = await fetch(`${base}/api/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent: "persistent",
          seed: 42,
          crash: true,
          cadenceMs: 0,
        }),
      });
      assert.equal(response.status, 201);
      const { id } = (await response.json()) as { id: string };
      await arena.finish(id);
      const view = (await (
        await fetch(`${base}/api/runs/${id}`)
      ).json()) as RunView;
      assert.equal(view.world.calendar.length, 1);
      assert.equal(view.crashCount, 1);
      const exported = (await (
        await fetch(`${base}/api/runs/${id}/export`)
      ).json()) as { format: string; run: Run };
      assert.equal(exported.format, "agena-run-v1");
      assert.equal(exported.run.id, id);
      const missing = await fetch(`${base}/api/runs/does-not-exist`);
      assert.equal(missing.status, 404);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  }));
