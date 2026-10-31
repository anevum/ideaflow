import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { cleanup, purgeProcessedAudio } from '../recovery/analyzer/index.mjs';

function database(schema) {
  const db = new DatabaseSync(':memory:');
  db.exec(schema);
  return { db, api: {
    prepare(sql) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() { return db.prepare(sql).get(...args) ?? null; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
        async run() { const result = db.prepare(sql).run(...args); return { meta: { changes: Number(result.changes) } }; },
      };
    },
    async batch(statements) {
      db.exec('BEGIN');
      try { const result = []; for (const statement of statements) result.push(await statement.run()); db.exec('COMMIT'); return result; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  } };
}

function fixture({ refuseDeletion = false } = {}) {
  const vault = database(`
    CREATE TABLE analyzer_lock(slot TEXT PRIMARY KEY, locked_until TEXT NOT NULL);
    CREATE TABLE submissions(id TEXT PRIMARY KEY, source TEXT, audio_key TEXT, audio_mime TEXT, segments_expected INTEGER,
      recording_finalized_at TEXT, processed_at TEXT, knowledge_synced_at TEXT, transcript_status TEXT, retention_hold INTEGER,
      audio_deleted_at TEXT, submitted_at TEXT, purged_at TEXT, raw_text TEXT, transcript TEXT);
    CREATE TABLE audio_segments(session_id TEXT, sequence_no INTEGER, object_key TEXT, transcript_status TEXT);
    CREATE TABLE retention_events(id TEXT PRIMARY KEY, submission_id TEXT, occurred_at TEXT, action TEXT, reason_code TEXT);
  `);
  const operations = database(`
    CREATE TABLE ops_state(key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE digest_sources(receipt_id TEXT, digest_id TEXT);
    CREATE TABLE memory_packets(id TEXT PRIMARY KEY, source_id TEXT, source_type TEXT, status TEXT, approved_at TEXT);
    CREATE TABLE knowledge_retrieval_receipts(packet_id TEXT, retrieved_at TEXT);
  `);
  const objects = new Map();
  const audio = {
    async delete(key) { if (refuseDeletion) throw new Error('synthetic storage failure'); objects.delete(key); },
    async get(key) { return objects.has(key) ? objects.get(key) : null; },
  };
  return { vault: vault.db, operations: operations.db, objects,
    env: { VAULT: vault.api, OPERATIONS: operations.api, AUDIO: audio },
    close() { vault.db.close(); operations.db.close(); } };
}

const ago = hours => new Date(Date.now() - hours * 3600_000).toISOString();
function record(f, id, { submitted = ago(72), synced = ago(48), hold = 0, audio = false, complete = true } = {}) {
  const key = audio ? `audio-${id}` : null;
  f.vault.prepare(`INSERT INTO submissions(id,source,audio_key,audio_mime,segments_expected,recording_finalized_at,processed_at,
    knowledge_synced_at,transcript_status,retention_hold,submitted_at,raw_text,transcript) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, audio ? 'audio' : 'text', key, audio ? 'audio/webm' : null, audio ? 1 : null,
      audio ? ago(70) : null, ago(48), synced, complete ? 'complete' : 'pending', hold, submitted, 'synthetic text', 'synthetic transcript');
  if (audio) { f.vault.prepare('INSERT INTO audio_segments VALUES(?,?,?,?)').run(id, 0, `segment-${id}`, complete ? 'complete' : 'pending'); f.objects.set(key, 1); f.objects.set(`segment-${id}`, 1); }
}
function proof(f, id, { status = 'approved', approved = ago(1), retrieved = ago(0.1) } = {}) {
  f.operations.prepare('INSERT INTO digest_sources VALUES(?,?)').run(id, `digest-${id}`);
  f.operations.prepare('INSERT INTO memory_packets VALUES(?,?,?,?,?)').run(`packet-${id}`, `digest-${id}`, 'digest', status, approved);
  if (retrieved) f.operations.prepare('INSERT INTO knowledge_retrieval_receipts VALUES(?,?)').run(`packet-${id}`, retrieved);
}

test('text cleanup holds recent, explicitly held, unapproved and unconfirmed records', async () => {
  const f = fixture(); try {
    record(f, 'no-receipt'); proof(f, 'no-receipt', { retrieved: null });
    record(f, 'unapproved'); proof(f, 'unapproved', { status: 'draft' });
    record(f, 'receipt-before-approval'); proof(f, 'receipt-before-approval', { approved: ago(1), retrieved: ago(2) });
    record(f, 'held', { hold: 1 }); proof(f, 'held');
    record(f, 'recent-submit', { submitted: ago(1) }); proof(f, 'recent-submit');
    record(f, 'recent-sync', { synced: ago(1) }); proof(f, 'recent-sync');
    await cleanup(f.env);
    const rows = f.vault.prepare('SELECT id,raw_text,transcript,purged_at FROM submissions').all();
    assert.equal(rows.length, 6); assert(rows.every(r => r.raw_text === 'synthetic text' && r.transcript === 'synthetic transcript' && r.purged_at === null));
  } finally { f.close(); }
});

test('qualifying old text is purged even if retrieval was recent', async () => {
  const f = fixture(); try {
    record(f, 'eligible'); proof(f, 'eligible', { approved: ago(0.2), retrieved: ago(0.1) });
    await cleanup(f.env);
    const row = f.vault.prepare('SELECT raw_text,transcript,purged_at FROM submissions WHERE id=?').get('eligible');
    assert.equal(row.raw_text, ''); assert.equal(row.transcript, null); assert.ok(row.purged_at);
    assert.equal(f.vault.prepare('SELECT COUNT(*) AS count FROM retention_events').get().count, 1);
  } finally { f.close(); }
});

test('audio purge requires proof and completed segments, preserving the transcript', async () => {
  const f = fixture(); try {
    record(f, 'eligible', { audio: true }); proof(f, 'eligible');
    record(f, 'missing-proof', { audio: true });
    record(f, 'incomplete', { audio: true }); proof(f, 'incomplete');
    f.vault.prepare("UPDATE audio_segments SET transcript_status='pending' WHERE session_id='incomplete'").run();
    await purgeProcessedAudio(f.env);
    const eligible = f.vault.prepare('SELECT audio_key,audio_deleted_at,transcript FROM submissions WHERE id=?').get('eligible');
    assert.equal(eligible.audio_key, null); assert.ok(eligible.audio_deleted_at); assert.equal(eligible.transcript, 'synthetic transcript');
    assert(!f.objects.has('segment-eligible')); assert(!f.objects.has('audio-eligible'));
    for (const id of ['missing-proof', 'incomplete']) { assert(f.objects.has(`segment-${id}`)); assert(f.objects.has(`audio-${id}`)); }
  } finally { f.close(); }
});

test('storage deletion errors leave the database record and transcript intact', async () => {
  const f = fixture({ refuseDeletion: true }); try {
    record(f, 'failed', { audio: true }); proof(f, 'failed');
    await cleanup(f.env);
    const row = f.vault.prepare('SELECT raw_text,transcript,purged_at FROM submissions WHERE id=?').get('failed');
    assert.equal(row.raw_text, 'synthetic text'); assert.equal(row.transcript, 'synthetic transcript'); assert.equal(row.purged_at, null);
    assert(f.objects.has('segment-failed'));
  } finally { f.close(); }
});
