import {test, expect} from 'bun:test';
import {existsSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPGliteDatabase, pgliteDataDir} from '../src/db-pglite.js';

test('PGlite selects the Fly volume instead of the ephemeral app directory', () => {
  expect(pgliteDataDir({})).toBe('.data/pglite');
  expect(pgliteDataDir({FLY_APP_NAME: 'helios-ai-laws'})).toBe('/data/pglite');
  expect(pgliteDataDir({FLY_APP_NAME: 'helios-ai-laws', HELIOS_PGLITE_DIR: '.data/pglite'})).toBe('/data/pglite');
  expect(pgliteDataDir({FLY_APP_NAME: 'helios-ai-laws', HELIOS_PGLITE_DIR: '/data/custom'})).toBe('/data/custom');
  expect(pgliteDataDir({HELIOS_PGLITE_DIR: '/tmp/custom'})).toBe('/tmp/custom');
});

test('PGlite creates missing parent directories and persists across restarts', async () => {
  const root = mkdtempSync(join(tmpdir(), 'helios-pglite-path-'));
  const dataDir = join(root, 'nested', 'missing', 'pglite');
  let db;
  try {
    db = await createPGliteDatabase(dataDir);
    await db.query('CREATE TABLE persistent_test (value text NOT NULL)');
    await db.query("INSERT INTO persistent_test (value) VALUES ('saved')");
    await db.close();
    db = undefined;
    expect(existsSync(dataDir)).toBe(true);
    db = await createPGliteDatabase(dataDir);
    const result = await db.query('SELECT value FROM persistent_test');
    expect(result.rows[0].value).toBe('saved');
  } finally {
    if (db) await db.close();
    rmSync(root, {recursive: true, force: true});
  }
});
