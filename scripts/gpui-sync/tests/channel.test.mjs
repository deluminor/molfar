import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { runSync } from '../lib/channel.mjs';
import { unionLedger, lock } from '../lib/state.mjs';
import { cmd, fixture } from './fixture.mjs';

test('complete publication and retry are idempotent', () => {
  const f = fixture();
  const prs = [];
  const transport = { list: () => prs, create: (repository, branch, base) => {
    const head = cmd(f.origin, 'rev-parse', `refs/heads/${branch}`);
    prs.push({ headRefName: branch, baseRefName: base, headRefOid: head, isDraft: true, url: 'https://github.com/example/target/pull/1', headRepositoryOwner: { login: 'example' }, headRepository: { name: 'target' }, body: 'review'  });
    return prs[0].url;
  } };
  const result = runSync({ cwd: f.work, publish: true, verifyIdentity: () => {}, config: f.config, transport });
  assert.equal(result.pr, 'https://github.com/example/target/pull/1');
  assert.equal(cmd(result.candidate, 'show', 'HEAD:feature.txt'), 'feature');
  const checkpoint = JSON.parse(cmd(result.candidate, 'show', 'HEAD:.github/gpui-upstream-sync.json'));
  assert.equal(checkpoint.source.attempted, result.source);
  assert.equal(checkpoint.source.integrated, f.baseline);
  assert.equal(checkpoint.source.validated, null);
  assert.equal(runSync({ cwd: f.work, publish: true, verifyIdentity: () => {}, config: f.config, transport }).head, result.head);
  assert.equal(prs.length, 1);
});

test('dirty checkout and contended lock fail closed', () => {
  const f = fixture();
  writeFileSync(join(f.work, 'dirty'), 'x');
  assert.throws(() => runSync({ cwd: f.work, verifyIdentity: () => {}, config: f.config }), /dirty/);
  const common = cmd(f.work, 'rev-parse', '--git-common-dir');
  const held = lock(join(f.work, common));
  assert.throws(() => runSync({ cwd: f.work, verifyIdentity: () => {}, config: f.config }), /lock exists/);
  held.release();
});

test('ledger preserves missing items and requires evidence', () => {
  const open = { version: 1, channel: 'gpui', items: [{ id: 'one', description: 'port', status: 'open', sourceRange: { from: 'a'.repeat(40), to: 'b'.repeat(40) }, affectedPaths: ['file'], disposition: 'pending review', resolutionRevision: null }] };
  const empty = { version: 1, channel: 'gpui', items: [] };
  assert.deepEqual(unionLedger(open, empty), open);
  assert.throws(() => unionLedger(open, { ...empty, items: [{ ...open.items[0], status: 'resolved' }] }), /evidence/);
  assert.equal(unionLedger(open, { ...empty, items: [{ ...open.items[0], status: 'resolved', evidence: 'review #4', resolutionRevision: 'c'.repeat(40) }] }).items[0].status, 'resolved');
  assert.throws(() => unionLedger(open, { ...empty, items: [{ ...open.items[0], affectedPaths: ['different'] }] }), /origin changed/);
});

test('protected changes and main cutover refuse publication', () => {
  const f = fixture();
  mkdirSync(join(f.source, '.github/workflows'), { recursive: true });
  writeFileSync(join(f.source, '.github/workflows/release.yml'), 'release');
  cmd(f.source, 'add', '.');
  cmd(f.source, 'commit', '-m', 'workflow');
  cmd(f.source, 'push', f.upstream, 'HEAD:refs/heads/native');
  assert.throws(() => runSync({ cwd: f.work, publish: true, verifyIdentity: () => {}, config: f.config }), /Protected upstream paths/);
  cmd(f.source, 'push', f.upstream, 'HEAD:refs/heads/main');
  assert.throws(() => runSync({ cwd: f.work, verifyIdentity: () => {}, config: f.config }), /main changed/);
});

test('failed conflict persists unresolved evidence across retry', () => {
  const f = fixture();
  writeFileSync(join(f.work, 'file.txt'), 'target\n');
  cmd(f.work, 'add', '.');
  cmd(f.work, 'commit', '-m', 'target change');
  cmd(f.work, 'push', 'origin', 'HEAD:refs/heads/migration/gpui');
  writeFileSync(join(f.source, 'file.txt'), 'upstream\n');
  cmd(f.source, 'add', '.');
  cmd(f.source, 'commit', '-m', 'source change');
  cmd(f.source, 'push', f.upstream, 'HEAD:refs/heads/native');
  const options = { cwd: f.work, config: f.config, verifyIdentity: () => {} };
  assert.throws(() => runSync({ ...options, publish: true }), /merge failed/);
  const ledgerPath = join(f.work, '.git/gpui-sync/unresolved.json');
  const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
  assert.equal(ledger.items.length, 1);
  assert.match(ledger.items[0].id, /^conflict:/);
  const result = runSync(options);
  assert.equal(result.unresolved, 1);
  assert.deepEqual(JSON.parse(readFileSync(ledgerPath, 'utf8')), ledger);
});

test('rewrite to earlier attempted source and malformed ledger refuse', () => {
  const f = fixture();
  const options = { cwd: f.work, config: f.config, verifyIdentity: () => {} };
  runSync(options);
  cmd(f.source, 'push', '--force', f.upstream, `${f.baseline}:refs/heads/native`);
  assert.throws(() => runSync(options), /rewrite/);
  writeFileSync(join(f.work, '.git/gpui-sync/unresolved.json'), '{broken');
  assert.throws(() => runSync(options), SyntaxError);
});

test('competing sync PR and stale source stop publication', () => {
  const f = fixture();
  const options = { cwd: f.work, config: f.config, verifyIdentity: () => {}, publish: true };
  const duplicate = { list: () => [{ headRefName: 'gpui-sync/other', baseRefName: 'migration/gpui', headRefOid: 'a'.repeat(40), isDraft: true, url: 'url' }], create: () => assert.fail('must not create') };
  assert.throws(() => runSync({ ...options, transport: duplicate }), /conflicts/);
  const stale = { list: () => {
    writeFileSync(join(f.source, 'another.txt'), 'new');
    cmd(f.source, 'add', '.');
    cmd(f.source, 'commit', '-m', 'new source');
    cmd(f.source, 'push', f.upstream, 'HEAD:refs/heads/native');
    return [];
  }, create: () => assert.fail('must not create') };
  assert.throws(() => runSync({ ...options, transport: stale }), /Remote source/);
});

test('equal source retains unresolved ledger without creating candidate', () => {
  const f = fixture();
  cmd(f.source, 'push', '--force', f.upstream, `${f.baseline}:refs/heads/native`);
  const stateDirectory = join(f.work, '.git/gpui-sync');
  mkdirSync(stateDirectory, { recursive: true });
  const ledger = { version: 1, channel: 'gpui', items: [{ id: 'pending', description: 'manual port', status: 'open', sourceRange: { from: f.baseline, to: f.baseline }, affectedPaths: ['file'], disposition: 'pending review', resolutionRevision: null }] };
  writeFileSync(join(stateDirectory, 'unresolved.json'), JSON.stringify(ledger));
  const transport = { list: () => assert.fail('must not list'), create: () => assert.fail('must not create') };
  const result = runSync({ cwd: f.work, config: f.config, verifyIdentity: () => {}, transport, publish: true });
  assert.equal(result.unresolved, 1);
  assert.equal(result.mode, 'inspect');
  assert.deepEqual(JSON.parse(readFileSync(join(stateDirectory, 'unresolved.json'), 'utf8')), ledger);
});

test('channel mismatch and different existing remote branch are refused', () => {
  const f = fixture();
  const options = { cwd: f.work, config: f.config, verifyIdentity: () => {} };
  assert.throws(() => runSync({ ...options, config: { ...f.config, sourceBranch: 'unexpected' } }), /channel mismatch/);
  const transport = { list: () => [], create: () => { throw new Error('create failed'); } };
  assert.throws(() => runSync({ ...options, publish: true, transport }), /create failed/);
  const records = JSON.parse(readFileSync(join(f.work, '.git/gpui-sync/attempt.json'), 'utf8'));
  const key = createHash('sha256').update(`${records.source}:${records.target}`).digest('hex').slice(0, 20);
  cmd(f.source, 'push', '--force', f.origin, `${f.baseline}:refs/heads/gpui-sync/${key}`);
  assert.throws(() => runSync({ ...options, publish: true, transport }), /Remote candidate branch differs/);
});
