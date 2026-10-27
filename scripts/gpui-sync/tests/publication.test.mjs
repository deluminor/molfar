import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { runSync } from '../lib/channel.mjs';
import { fixture, cmd } from './fixture.mjs';

function metadata(f, branch, base) {
  return { headRefName: branch, baseRefName: base, headRefOid: cmd(f.origin, 'rev-parse', `refs/heads/${branch}`), isDraft: true, url: 'https://github.com/example/target/pull/1', headRepositoryOwner: { login: 'example' }, headRepository: { name: 'target' }, body: 'review' };
}

function state(f) {
  const attempt = JSON.parse(readFileSync(join(f.work, '.git/gpui-sync/attempt.json'), 'utf8'));
  const key = createHash('sha256').update(`${attempt.source}:${attempt.target}`).digest('hex').slice(0, 20);
  return { key, branch: `gpui-sync/${key}`, record: join(f.work, `.git/gpui-sync/candidate-${key}.json`) };
}

function advance(f) {
  writeFileSync(join(f.source, 'race.txt'), 'new');
  cmd(f.source, 'add', '.');
  cmd(f.source, 'commit', '-m', 'source advanced during API read');
  cmd(f.source, 'push', f.upstream, 'HEAD:refs/heads/native');
}

test('remote change during first PR list leaves candidate ref absent', () => {
  const f = fixture();
  const transport = { list: () => { advance(f); return []; }, create: () => assert.fail('must not create') };
  assert.throws(() => runSync({ cwd: f.work, config: f.config, verifyIdentity: () => {}, publish: true, transport }), /Remote source/);
  assert.throws(() => cmd(f.origin, 'rev-parse', `refs/heads/${state(f).branch}`));
});

test('remote change during second PR list refuses create', () => {
  const f = fixture();
  let calls = 0;
  const transport = { list: () => { if (++calls === 2) advance(f); return []; }, create: () => assert.fail('must not create') };
  assert.throws(() => runSync({ cwd: f.work, config: f.config, verifyIdentity: () => {}, publish: true, transport }), /Remote source/);
  assert.ok(cmd(f.origin, 'rev-parse', `refs/heads/${state(f).branch}`));
});

test('rejected push retains exact candidate and retry publishes once', () => {
  const f = fixture();
  cmd(f.origin, 'config', 'receive.hideRefs', 'refs/heads/gpui-sync/');
  let pr;
  let creates = 0;
  const transport = { list: () => pr ? [pr] : [], create: (repository, branch, base) => { ++creates; pr = metadata(f, branch, base); return pr.url; } };
  const options = { cwd: f.work, config: f.config, verifyIdentity: () => {}, publish: true, transport };
  assert.throws(() => runSync(options), /push/);
  const retained = JSON.parse(readFileSync(state(f).record, 'utf8'));
  assert.equal(creates, 0);
  cmd(f.origin, 'config', '--unset', 'receive.hideRefs');
  const result = runSync(options);
  assert.equal(result.head, retained.head);
  assert.equal(creates, 1);
});

test('PR create succeeds remotely then throws; retry adopts existing PR', () => {
  const f = fixture();
  let pr;
  let creates = 0;
  const transport = { list: () => pr ? [pr] : [], create: (repository, branch, base) => { ++creates; pr = metadata(f, branch, base); throw new Error('response lost after creation'); } };
  const options = { cwd: f.work, config: f.config, verifyIdentity: () => {}, publish: true, transport };
  assert.throws(() => runSync(options), /response lost/);
  assert.equal(runSync(options).pr, pr.url);
  assert.equal(creates, 1);
});

test('disappeared PR between two reads is refused', () => {
  const f = fixture();
  let pr;
  const transport = { list: () => pr ? [pr] : [], create: (repository, branch, base) => { pr = metadata(f, branch, base); return pr.url; } };
  const options = { cwd: f.work, config: f.config, verifyIdentity: () => {}, publish: true, transport };
  runSync(options);
  let reads = 0;
  transport.list = () => ++reads === 1 ? [pr] : [];
  transport.create = () => assert.fail('closed PR needs review');
  assert.throws(() => runSync(options), /PR.*(?:changed|disappeared|closed|verified)/i);
});

test('actual second process cannot obtain common repository lock', async () => {
  const f = fixture();
  const common = join(f.work, '.git');
  const worker = join(f.dir, 'lock-worker.mjs');
  const stateModule = new URL('../lib/state.mjs', import.meta.url).href;
  writeFileSync(worker, `import { lock } from ${JSON.stringify(stateModule)};\ntry { const held = lock(process.argv[2]); process.send('held'); process.once('message', () => { held.release(); process.exit(0); }); } catch (error) { process.send(error.message); process.exit(1); }\n`);
  const first = fork(worker, [common], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  try {
    assert.equal((await once(first, 'message'))[0], 'held');
    const second = fork(worker, [common], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    const exited = once(second, 'exit');
    assert.match((await once(second, 'message'))[0], /lock exists/);
    assert.equal((await exited)[0], 1);
  } finally {
    const exited = once(first, 'exit');
    first.send('release');
    await exited;
  }
});
