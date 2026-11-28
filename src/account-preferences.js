// Private account settings. Identity comes from verified Auth, never the body.
export const PREFERENCE_SCHEMA = [
  'CREATE TABLE IF NOT EXISTS account_preferences(actor TEXT PRIMARY KEY, preferences TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL)',
];
export const preferenceDefaults = () => ({displayName: '', theme: 'system', reducedMotion: false, favoriteLawIds: []});

export function preferenceStore(db, Problem) {
  const fail = (status, message) => { throw new Problem(status, message); };
  const result = row => row ? {preferences: JSON.parse(row.preferences), revision: row.revision, updatedAt: row.updated_at}
    : {preferences: preferenceDefaults(), revision: 0, updatedAt: null};
  function validate(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['expectedRevision', 'preferences'].includes(key))
      || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) fail(400, 'Provide the current settings revision.');
    const settings = input.preferences;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)
      || Object.keys(settings).some(key => !['displayName', 'theme', 'reducedMotion', 'favoriteLawIds'].includes(key))
      || typeof settings.displayName !== 'string' || settings.displayName.length > 80 || /[\x00-\x1f\x7f]/.test(settings.displayName)
      || !['system', 'light', 'dark'].includes(settings.theme) || typeof settings.reducedMotion !== 'boolean'
      || !Array.isArray(settings.favoriteLawIds) || settings.favoriteLawIds.length > 100
      || settings.favoriteLawIds.some(id => typeof id !== 'string' || !/^HGA-(?:00[1-9]|0[1-9]\d|100)$/.test(id))) {
      fail(400, 'Provide a display name, theme, motion preference and valid favorite law IDs.');
    }
    return {displayName: settings.displayName.normalize('NFC').trim(), theme: settings.theme,
      reducedMotion: settings.reducedMotion, favoriteLawIds: [...new Set(settings.favoriteLawIds)].sort()};
  }
  return {
    async read(actor) {
      return result((await db.query('SELECT preferences,revision,updated_at FROM account_preferences WHERE actor=$1', [actor])).rows[0]);
    },
    async writeIn(q, input, actor) {
      const preferences = validate(input);
      await q.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['preferences:' + actor]);
      const prior = (await q.query('SELECT revision FROM account_preferences WHERE actor=$1', [actor])).rows[0];
      if ((prior?.revision ?? 0) !== input.expectedRevision) fail(409, 'Your settings changed on another device. Reload before saving.');
      const row = (await q.query('INSERT INTO account_preferences(actor,preferences,revision,updated_at) VALUES($1,$2,$3,$4) ON CONFLICT(actor) DO UPDATE SET preferences=EXCLUDED.preferences,revision=EXCLUDED.revision,updated_at=EXCLUDED.updated_at RETURNING preferences,revision,updated_at',
        [actor, JSON.stringify(preferences), input.expectedRevision + 1, new Date().toISOString()])).rows[0];
      return result(row);
    },
  };
}
