import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Run } from '../shared/types.ts';

export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, body TEXT NOT NULL)');
  }
  save(run: Run) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT INTO runs (id,body) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(run.id, JSON.stringify(run));
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  get(id: string): Run | undefined {
    const row = this.db.prepare('SELECT body FROM runs WHERE id=?').get(id);
    return row ? JSON.parse(row.body as string) as Run : undefined;
  }
  list(): Run[] { return (this.db.prepare('SELECT body FROM runs ORDER BY rowid DESC').all() as { body: string }[]).map(r => JSON.parse(r.body) as Run); }
  close() { this.db.close(); }
}
