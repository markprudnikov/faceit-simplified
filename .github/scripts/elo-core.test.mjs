import assert from 'node:assert/strict';
import test from 'node:test';
import '../../elo-core.js';
const { History, readPage, dayKey, weekStart } = globalThis.FaceitSimplifiedElo;
const zone = 'Europe/Berlin';
const row = (id, date, delta = 20) => ({ key: `${id}:1`, matchId: id, started: Date.parse(date), delta });
const signal = () => new AbortController().signal;

test('cursor pages complete a split day without double-counting or refetching', async () => {
  const first = row('a', '2026-10-01T21:22:59Z', 30);
  const calls = [];
  const history = new History(async token => {
    calls.push(token);
    return token === null
      ? { rows: [first], nextToken: '2026-10-01T21:22:59Z' }
      : { rows: [first, row('b', '2026-10-01T20:33:00Z', -22), row('c', '2026-09-30T19:57:00Z')], nextToken: 'older' };
  }, zone);
  assert.equal(await history.ensure('2026-10-01', signal(), 1), false);
  assert.equal(history.covers('2026-10-01'), false);
  assert.equal(await history.ensure('2026-10-01', signal()), true);
  assert.deepEqual(calls, [null, '2026-10-01T21:22:59Z']);
  assert.equal(history.summary().get('2026-10-01').net, 8);
  assert.equal(history.summary().get('2026-10-01').matches, 2);
  await history.ensure('2026-10-02', signal());
  assert.equal(calls.length, 2);
});

test('failure retries the same cursor and preserves previously loaded data', async () => {
  const calls = [];
  let failed = false;
  const history = new History(async token => {
    calls.push(token);
    if (token === null) return { rows: [row('a', '2026-10-01T12:00:00Z')], nextToken: 'next' };
    if (!failed) { failed = true; throw new Error('temporary failure'); }
    return { rows: [row('b', '2026-09-29T12:00:00Z')], nextToken: null };
  }, zone);
  await assert.rejects(history.ensure('2026-09-28', signal()), /temporary failure/);
  assert.equal(history.rows.size, 1);
  assert.equal(history.nextToken, 'next');
  assert.equal(await history.ensure('2026-09-28', signal()), true);
  assert.deepEqual(calls, [null, 'next', 'next']);
});

test('repeated cursors are rejected atomically even if rows change', async () => {
  let page = 0;
  const history = new History(async () => ({ rows: [row(String(++page), '2026-10-01T12:00:00Z')], nextToken: 'same' }), zone);
  await assert.rejects(history.ensure('2026-09-28', signal()), /did not return older/);
  assert.equal(history.rows.size, 1);
  assert.equal(history.covers('2026-09-28'), false);
});

test('a cursor without matches is not treated as complete history', async () => {
  const history = new History(async () => ({ rows: [], nextToken: 'next' }), zone);
  await assert.rejects(history.ensure('2026-09-28', signal()), /did not return older/);
  assert.equal(history.started, false);
});

test('bounded loading resumes at the last successful cursor', async () => {
  const calls = [];
  const history = new History(async token => {
    calls.push(token);
    return { rows: [row(String(calls.length), `2026-10-0${9 - calls.length}T12:00:00Z`)], nextToken: String(calls.length) };
  }, zone);
  assert.equal(await history.ensure('2026-09-01', signal()), false);
  assert.deepEqual(calls, [null, '1', '2', '3']);
  await history.ensure('2026-09-01', signal(), 1);
  assert.equal(calls.at(-1), '4');
});

test('end of history completes even an empty account', async () => {
  const history = new History(async () => ({ rows: [], nextToken: null }), zone);
  assert.equal(await history.ensure('2026-09-28', signal()), true);
  assert.equal(history.exhausted, true);
});

test('aborted response never advances the cursor', async () => {
  const controller = new AbortController();
  const history = new History(async () => {
    controller.abort();
    return { rows: [row('a', '2026-10-01T12:00:00Z')], nextToken: 'next' };
  }, zone);
  await assert.rejects(history.ensure('2026-09-28', controller.signal), { name: 'AbortError' });
  assert.equal(history.started, false);
  assert.equal(history.nextToken, null);
});

test('profile-history camelCase and legacy snake_case preserve zero/missing Elo', () => {
  const body = { payload: { id: 'player', cs2: { matchRounds: [
    { matchId: 'a', startTime: '2026-10-01T22:30:00Z', eloDelta: 0 },
    { matchId: 'b', startTime: '2026-10-01T21:30:00Z' }
  ] }, nextOffsetToken: 'opaque-token' } };
  const parsed = readPage(body, 'player');
  assert.equal(parsed.nextToken, 'opaque-token');
  assert.equal(parsed.rows[0].delta, 0);
  assert.equal(parsed.rows[1].delta, null);
  assert.equal(dayKey(parsed.rows[0].started, zone), '2026-10-02');
  assert.equal(readPage({payload:{id:'player',cs2:{match_rounds:[{match_id:'a',start_time:'2026-10-01T22:30:00Z',elo_delta:0}]},next_offset_token:'next'}},'player').rows[0].delta,0);
  assert.throws(() => readPage(body, 'another-player'), /unexpected/);
  assert.equal(weekStart('2026-10-25'), '2026-10-19');
});
