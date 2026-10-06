import { it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import worker from './index.mjs';
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

it('同場補結算會越過已讀游標，保留單筆來源與完整數值', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const env = {
    PVP_WRITE_SECRET: 'test-write', PVP_SITE_PASSWORD: 'test-site', PVP_SESSION_SECRET: 'test-session',
    DB: { prepare(sql) {
      const statement = db.prepare(sql); let values = [];
      return {
        bind(...args) { values = args; return this; },
        async first() { return statement.get(...values); },
        async all() { return { results: statement.all(...values) }; },
        async run() { const result = statement.run(...values); return { meta: { last_row_id: Number(result.lastInsertRowid), changes: Number(result.changes) } }; },
      };
    } },
  };
  const data = { battleAt: 1000, mode: '1v1', outcome: 'unknown', playerTeam: [{ name: 'A' }], opponentTeam: [{ name: 'B' }], sourceBattleChannel: 'pvp_battle:123', sourceBattleId: '123', scoreAfter: 27450 };
  const capture = async (payload, workspaceId = '832459') => {
    const response = await worker.fetch(new Request('https://test/api/pvp/capture', {
      method: 'POST', headers: { 'X-RF-Write-Secret': 'test-write' }, body: JSON.stringify({ workspaceId, data: payload }),
    }), env);
    expect(response.ok).toBe(true);
    return response.json();
  };
  try {
    const original = await capture(data);
    const other = await capture({ ...data, sourceBattleChannel: 'pvp_battle:124', sourceBattleId: '124' });
    const completed = await capture({ ...data, outcome: 'win', scoreBefore: 27330, rankBefore: 47, rankAfter: 46 });
    expect(completed.updated).toBe(true);
    expect(completed.eventId).toBeGreaterThan(other.eventId);
    expect(completed.eventId).toBeGreaterThan(original.eventId);
    expect(db.prepare('SELECT COUNT(*) AS count FROM pvp_events').get().count).toBe(2);
    const duplicate = await capture(data);
    expect(duplicate).toMatchObject({ duplicate: true, updated: false, eventId: completed.eventId });
    const login = await worker.fetch(new Request('https://test/api/pvp/login', { method: 'POST', body: JSON.stringify({ password: 'test-site' }) }), env);
    const cookie = login.headers.get('set-cookie');
    const poll = async (workspaceId) => (await worker.fetch(new Request(`https://test/api/pvp/events?workspaceId=${workspaceId}&after=${other.eventId}`, { headers: { Cookie: cookie } }), env)).json();
    const result = await poll('832459');
    expect(result.events).toHaveLength(1);
    expect(result.events[0].data).toMatchObject({ sourceBattleId: '123', outcome: 'win', scoreBefore: 27330, scoreAfter: 27450, rankBefore: 47, rankAfter: 46 });
    expect((await poll('999')).events).toHaveLength(0);
  } finally { db.close(); }
});
