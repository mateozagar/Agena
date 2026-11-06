import { makeSimpleAgent, persistentAgent } from './agents.ts';
import type { Observation, ToolName, ToolResult, Json } from '../shared/types.ts';

const adapter = process.argv[2] === 'simple' ? makeSimpleAgent() : persistentAgent;
let requestId = 0;
const waiting = new Map<number, (result: ToolResult) => void>();
function call(name: ToolName, args: Record<string, Json> = {}): Promise<ToolResult> {
  return new Promise(resolve => {
    const id = ++requestId;
    waiting.set(id, resolve);
    process.send!({ type: 'tool', id, name, args });
  });
}
process.on('message', async (message: { type: string; id: number; result: ToolResult; observation: Observation }) => {
  if (message.type === 'result') { waiting.get(message.id)?.(message.result); waiting.delete(message.id); }
  if (message.type === 'observe') {
    try { await adapter.onObservation({ observation: message.observation, call }); process.send!({ type: 'done' }); }
    catch (error) { process.send!({ type: 'agent-error', message: error instanceof Error ? error.message : 'Unknown worker failure' }); }
  }
});
process.on('disconnect', () => process.exit(0));
