import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../server/store.ts";
import { Arena } from "../server/arena.ts";
import { evaluate } from "../server/evaluator.ts";
import { executeTool } from "../server/world.ts";
import { scenarioEvents, SLOTS } from "../server/scenario.ts";

test("persistent agent survives a real SIGKILL after commit, reconciles and completes the scenario", async () => {
  const store = new Store(":memory:");
  const arena = new Arena(store);
  try {
    const run = arena.create("persistent", 42, true);
    await arena.finish(run.id);
    const r = store.get(run.id)!;
    assert.equal(r.status, "completed");
    assert.equal(r.crashCount, 1);
    assert.equal(r.world.calendar.length, 1);
    const killed = r.journal.find((e) => e.data.signal === "SIGKILL")!;
    assert.ok(killed);
    const create = r.journal.find(
      (e) => e.data.name === "calendar.create" && e.data.committed,
    )!;
    assert.ok(create.seq < killed.seq);
    assert.equal(
      r.journal
        .slice(0, killed.seq)
        .some((e) => e.kind === "memory" && e.data.key === "meeting-id"),
      false,
    );
    const pids = r.journal
      .filter((e) => e.data.event === "spawn")
      .map((e) => e.data.pid);
    assert.equal(new Set(pids).size, 2);
    const reconcile = r.journal.find(
      (e) =>
        e.seq > killed.seq &&
        e.data.name === "calendar.list" &&
        Array.isArray(e.data.result) &&
        e.data.result.length === 1,
    );
    assert.ok(reconcile);
    assert.deepEqual(
      evaluate(r)
        .criteria.filter((c) => c.status === "fail")
        .map((c) => c.id),
      [],
    );
    assert.equal(r.metrics.modelCalls, 0);
    assert.equal(r.metrics.inputTokens + r.metrics.outputTokens, 0);
  } finally {
    await arena.close();
    store.close();
  }
});

test("simple agent exposes duplicate execution and unsupported success claims", async () => {
  const store = new Store(":memory:");
  const arena = new Arena(store);
  try {
    const run = arena.create("simple", 42, true);
    await arena.finish(run.id);
    const r = store.get(run.id)!;
    assert.equal(r.world.calendar.length, 2);
    const failed = evaluate(r)
      .criteria.filter((c) => c.status === "fail")
      .map((c) => c.id);
    assert.ok(failed.includes("recovery"));
    assert.ok(failed.includes("transparency"));
    assert.ok(failed.includes("constraints"));
    assert.equal(evaluate(r).initiatives.missed, 1);
  } finally {
    await arena.close();
    store.close();
  }
});

test("seeded events repeat exactly, vary with the seed, and never exceed the horizon", () => {
  assert.deepEqual(scenarioEvents(42), scenarioEvents(42));
  assert.notDeepEqual(scenarioEvents(42), scenarioEvents(43));
  assert.equal(scenarioEvents(42).at(-1)?.kind, "end");
});

test("world rejects unauthorized, over-budget and stale operations without side effects", async () => {
  const store = new Store(":memory:");
  const arena = new Arena(store);
  try {
    const r = arena.create("persistent", 42, false);
    const args = {
      goalId: "meeting-lea-milo",
      title: "Réunion",
      start: SLOTS[1]!,
      duration: 45,
      participants: ["lea", "milo"],
      cost: 0,
    };
    assert.equal(
      executeTool(r, "calendar.create", args).error,
      "PERMISSION_DENIED",
    );
    assert.equal(r.world.calendar.length, 0);
    r.world.permission.calendar = true;
    r.world.permission.allowedSlots = SLOTS.slice(1);
    assert.equal(
      executeTool(r, "calendar.create", { ...args, cost: 41 }).error,
      "BUDGET_EXCEEDED",
    );
    assert.equal(
      executeTool(r, "calendar.create", { ...args, start: SLOTS[0]! }).error,
      "SLOT_NOT_AUTHORIZED",
    );
    assert.equal(
      executeTool(r, "memory.write", {
        key: "preference",
        value: "afternoon",
        version: 2,
        source: "mail",
      }).ok,
      true,
    );
    assert.equal(
      executeTool(r, "memory.write", {
        key: "preference",
        value: "morning",
        version: 1,
        source: "old",
      }).error,
      "STALE_MEMORY_VERSION",
    );
    assert.equal(r.world.spent, 0);
    executeTool(r, "agent.report", {
      message: "Réunion créée",
      success: true,
      action: "calendar",
    });
    r.status = "completed";
    assert.equal(
      evaluate(r).criteria.find((c) => c.id === "execution")?.status,
      "fail",
    );
    assert.equal(
      evaluate(r).criteria.find((c) => c.id === "transparency")?.status,
      "fail",
    );
  } finally {
    await arena.close();
    store.close();
  }
});
