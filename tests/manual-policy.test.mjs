import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../recovery/analyzer/index.mjs';

function fixture(request = null) {
  const calls = { locks: [], states: [], ai: 0, ack: 0, retry: [] };
  const env = {
    AI: { async run() { calls.ai++; throw new Error('AI must not run in this fixture'); } },
    VAULT: { prepare(sql) { let args = []; return {
      bind(...v) { args = v; return this; },
      async run() { if (sql.startsWith('INSERT INTO analyzer_lock')) calls.locks.push(args[0]); return { meta: { changes: 0 } }; },
    }; } },
    OPERATIONS: { prepare(sql) { let args = []; return {
      bind(...v) { args = v; return this; },
      async first() { if (sql.includes("key='manual_processing_request'")) return request === null ? null : { value: JSON.stringify(request) }; return null; },
      async run() { if (sql.startsWith('INSERT INTO ops_state')) calls.states.push([args[0], JSON.parse(args[1])]); return { meta: { changes: 1 } }; },
    }; } },
  };
  const message = body => ({ body, ack() { calls.ack++; }, retry(options) { calls.retry.push(options); } });
  return { calls, env, message };
}

test('ordinary intake events cannot start transcription or analysis', async () => {
  const f = fixture();
  await worker.queue({ messages: [f.message(null), f.message({ kind: 'intake_receipt' })] }, f.env);
  assert.equal(f.calls.ack, 2); assert.deepEqual(f.calls.locks, []); assert.equal(f.calls.ai, 0);
});

test('manual event must match a persisted active request', async () => {
  const f = fixture({ id: 'approved-request', status: 'queued' });
  await worker.queue({ messages: [f.message({ kind: 'operator_manual_process_v1', request_id: 'other-request' })] }, f.env);
  assert.equal(f.calls.ack, 1); assert.deepEqual(f.calls.locks, []); assert.equal(f.calls.ai, 0);
});

test('a currently running manual request is retried rather than duplicated', async () => {
  const f = fixture({ id: 'request-1', status: 'running', started_at: new Date().toISOString() });
  await worker.queue({ messages: [f.message({ kind: 'operator_manual_process_v1', request_id: 'request-1' })] }, f.env);
  assert.equal(f.calls.ack, 0); assert.deepEqual(f.calls.retry, [{ delaySeconds: 180 }]); assert.deepEqual(f.calls.locks, []);
});

test('only a verified manual request enters the processing path', async () => {
  const f = fixture({ id: 'request-1', status: 'queued' });
  await worker.queue({ messages: [f.message({ kind: 'operator_manual_process_v1', request_id: 'request-1' })] }, f.env);
  assert.equal(f.calls.ack, 1); assert.deepEqual(f.calls.locks, ['gpt-transcription', 'daily', 'audio-purge', 'retention']);
  assert.deepEqual(f.calls.states.map(([key, value]) => [key, value.status]), [['manual_processing_request', 'running'], ['manual_processing_request', 'batch_finished']]);
  assert.equal(f.calls.ai, 0);
});

test('scheduled work runs only privacy-retention paths', async () => {
  const f = fixture(); const pending = [];
  await worker.scheduled({}, f.env, { waitUntil(p) { pending.push(p); } });
  await Promise.all(pending);
  assert.deepEqual(f.calls.locks, ['audio-purge', 'retention']); assert.equal(f.calls.ai, 0); assert.deepEqual(f.calls.states, []);
});
