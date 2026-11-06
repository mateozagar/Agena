export type AgentKind = "simple" | "persistent";
export type RunStatus = "ready" | "running" | "paused" | "completed" | "failed";
export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };
export type ToolName =
  | "world.read"
  | "calendar.list"
  | "calendar.create"
  | "calendar.update"
  | "memory.read"
  | "memory.write"
  | "task.complete"
  | "mail.send"
  | "agent.wake"
  | "agent.report";
export interface Preference {
  value: "morning" | "afternoon";
  version: number;
  source: string;
}
export interface Memory {
  key: string;
  value: Json;
  version: number;
  source: string;
}
export interface Meeting {
  id: string;
  goalId: string;
  title: string;
  start: string;
  duration: number;
  participants: string[];
  cost: number;
  createdAt: string;
  updatedAt: string;
}
export interface Mail {
  id: string;
  from: string;
  subject: string;
  body: string;
  at: string;
  kind:
    | "request"
    | "preference"
    | "availability"
    | "permission"
    | "document"
    | "noise"
    | "reminder";
}
export interface World {
  now: string;
  inbox: Mail[];
  calendar: Meeting[];
  tasks: { id: string; title: string; done: boolean; completedAt?: string }[];
  contacts: { id: string; name: string; email: string }[];
  preference: Preference;
  availability: string[];
  permission: { calendar: boolean; messages: boolean; allowedSlots: string[] };
  budget: number;
  spent: number;
  documentReady: boolean;
  reminderSent: boolean;
  mailFailureRemaining: number;
}
export interface WorldEvent {
  id: string;
  at: string;
  kind: "mail" | "deadline" | "wake" | "end";
  title: string;
  data?: Record<string, Json>;
}
export interface JournalEntry {
  seq: number;
  virtualAt: string;
  kind: "world" | "observation" | "tool" | "memory" | "lifecycle" | "report";
  title: string;
  data: Record<string, Json>;
}
export interface Metrics {
  computeMs: number;
  toolCalls: number;
  modelCalls: number;
  inputTokens: number;
  outputTokens: number;
  processes: number;
}
export interface Run {
  id: string;
  agent: AgentKind;
  seed: number;
  scenarioVersion: string;
  status: RunStatus;
  createdAt: string;
  world: World;
  queue: WorldEvent[];
  journal: JournalEntry[];
  memories: Memory[];
  metrics: Metrics;
  crashArmed: boolean;
  crashCount: number;
  crashAfterCreate: boolean;
  checkpoint: number;
  pendingObservation: Observation | null;
  error?: string;
}
export interface Observation {
  now: string;
  event: WorldEvent;
  resumed: boolean;
}
export interface ToolRequest {
  type: "tool";
  id: number;
  name: ToolName;
  args: Record<string, Json>;
}
export interface ToolResult {
  ok: boolean;
  value?: Json;
  error?: string;
}
export interface Evidence {
  seq: number;
  label: string;
}
export interface Criterion {
  id: string;
  label: string;
  status: "pass" | "fail" | "pending" | "measured" | "not_tested";
  detail: string;
  evidence: Evidence[];
}
export interface Evaluation {
  criteria: Criterion[];
  initiatives: {
    useful: number;
    missed: number;
    unnecessary: number;
    critical: number;
  };
  evaluatedAt: string;
}
export interface RunView extends Run {
  evaluation: Evaluation;
}
export interface AdapterContext {
  observation: Observation;
  call: (name: ToolName, args?: Record<string, Json>) => Promise<ToolResult>;
}
export interface AgentAdapter {
  id: string;
  kind: "scripted" | "llm";
  onObservation(context: AdapterContext): Promise<void>;
}
