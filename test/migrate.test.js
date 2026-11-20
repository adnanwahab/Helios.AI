import {test, expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {migrate} from '../scripts/migrate-sqlite.js';
import {createPGliteDatabase} from '../src/db-pglite.js';
import {hash, openStore} from '../src/store.js';
import seedCatalog from '../data/catalog.json' with {type: 'json'};

test('a SQLite database copies into an empty Postgres with ids, versions and timestamps intact', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'helios-migrate-'));
  const path = join(dir, 'helios.sqlite');
  const source = new Database(path);
  try {
    source.exec(`
      CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE laws(id TEXT PRIMARY KEY, current_version TEXT NOT NULL, author TEXT, created_at TEXT NOT NULL);
      CREATE TABLE versions(id TEXT PRIMARY KEY, law_id TEXT NOT NULL REFERENCES laws(id), number INTEGER NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL, amendment_id TEXT, UNIQUE(law_id,number));`);
    source.query('INSERT INTO metadata VALUES(?,?)').run('catalog_hash', hash(JSON.stringify(seedCatalog)));
    const now = '2026-11-20T15:00:00.000Z';
    for (const [index, goal] of seedCatalog.goals.slice(0, 2).entries()) {
      source.query('INSERT INTO laws VALUES(?,?,NULL,?)').run(goal.id, `version-${index}`, now);
      source.query('INSERT INTO versions VALUES(?,?,1,?,?,NULL)').run(`version-${index}`, goal.id, JSON.stringify(goal), now);
    }
  } finally {
    source.close();
  }

  const db = await createPGliteDatabase();
  try {
    const counts = await migrate({sqlitePath: path, db});
    expect(counts.laws).toBe(2);
    expect(counts.versions).toBe(2);
    const store = await openStore(db);
    expect((await store.catalog()).goals).toHaveLength(2);
    const detail = await store.detail(seedCatalog.goals[0].id);
    expect(detail.law.versionId).toBe('version-0');
    expect(detail.versions[0].createdAt).toBe('2026-11-20T15:00:00.000Z');
    await expect(migrate({sqlitePath: path, db})).rejects.toThrow('already has Helios data');
  } finally {
    await db.close();
    rmSync(dir, {recursive: true, force: true});
  }
});
