import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { runSync } from '../lib/channel.mjs';
import { cmd, fixture } from './fixture.mjs';

test('native publishing scripts are protected and inherited Git redirects are ignored', () => {
  const f = fixture();
  const options = { cwd: f.work, config: f.config, verifyIdentity: () => {} };
  const previous = process.env.GIT_DIR;
  process.env.GIT_DIR = join(f.dir, 'bogus');
  try {
    assert.equal(runSync(options).mode, 'inspect');
  } finally {
    if (previous === undefined) delete process.env.GIT_DIR;
    else process.env.GIT_DIR = previous;
  }
  mkdirSync(join(f.source, 'scripts'), { recursive: true });
  writeFileSync(join(f.source, 'scripts/package-native.mjs'), 'publish');
  cmd(f.source, 'add', '.');
  cmd(f.source, 'commit', '-m', 'publishing');
  cmd(f.source, 'push', f.upstream, 'HEAD:refs/heads/native');
  assert.throws(() => runSync(options), /Protected upstream paths/);
});

test('resolution revision must be reachable from target', () => {
  const f = fixture();
  const stateDirectory = join(f.work, '.git/gpui-sync');
  mkdirSync(stateDirectory, { recursive: true });
  const sourceHead = cmd(f.source, 'rev-parse', 'HEAD');
  const ledger = { version: 1, channel: 'gpui', items: [{ id: 'pending', description: 'manual port', status: 'resolved', sourceRange: { from: f.baseline, to: sourceHead }, affectedPaths: ['file'], disposition: 'reviewed', evidence: 'review 1', resolutionRevision: sourceHead }] };
  writeFileSync(join(stateDirectory, 'unresolved.json'), JSON.stringify(ledger));
  assert.throws(() => runSync({ cwd: f.work, config: f.config, verifyIdentity: () => {} }), /not reachable/);
  ledger.items[0].resolutionRevision = f.baseline;
  writeFileSync(join(stateDirectory, 'unresolved.json'), JSON.stringify(ledger));
  assert.equal(runSync({ cwd: f.work, config: f.config, verifyIdentity: () => {} }).unresolved, 0);
});

test('already integrated source requires checkpoint reconciliation', () => {
  const f = fixture();
  cmd(f.work, 'fetch', 'upstream', 'refs/heads/native');
  cmd(f.work, 'merge', '--no-ff', '-m', 'integrate source', 'FETCH_HEAD');
  cmd(f.work, 'push', 'origin', 'HEAD:refs/heads/migration/gpui');
  assert.throws(() => runSync({ cwd: f.work, config: f.config, verifyIdentity: () => {} }), /reconcile integration checkpoint/);
});

test('source integration checkpoint must be reachable from target', () => {
  const f = fixture();
  const tree = cmd(f.work, 'rev-parse', 'HEAD^{tree}');
  const unrelated = cmd(f.work, 'commit-tree', tree, '-m', 'unrelated root');
  cmd(f.work, 'checkout', '--detach', unrelated);
  const path = join(f.work, '.github/gpui-upstream-sync.json');
  const checkpoint = JSON.parse(readFileSync(path, 'utf8'));
  checkpoint.target.integrated = unrelated;
  writeFileSync(path, JSON.stringify(checkpoint));
  cmd(f.work, 'add', path);
  cmd(f.work, 'commit', '-m', 'new target checkpoint');
  cmd(f.work, 'push', '--force', 'origin', 'HEAD:refs/heads/migration/gpui');
  assert.throws(() => runSync({ cwd: f.work, config: f.config, verifyIdentity: () => {} }), /Target checkpoint is unreachable/);
});

test('same candidate head on another base blocks publication', () => {
  const f = fixture();
  const source = cmd(f.source, 'rev-parse', 'HEAD');
  const target = cmd(f.work, 'rev-parse', 'HEAD');
  const key = createHash('sha256').update(`${source}:${target}`).digest('hex').slice(0, 20);
  const branch = `gpui-sync/${key}`;
  const transport = { list: () => [{ headRefName: branch, baseRefName: 'main', headRefOid: source, isDraft: true, url: 'https://github.com/example/target/pull/2' }], create: () => assert.fail('must not create') };
  assert.throws(() => runSync({ cwd: f.work, config: f.config, verifyIdentity: () => {}, publish: true, transport }), /conflicts/);
  assert.throws(() => cmd(f.origin, 'rev-parse', `refs/heads/${branch}`));
});

test('symlinked runtime directories and ledgers are rejected', () => {
  const f = fixture();
  const external = join(f.dir, 'external');
  mkdirSync(external);
  symlinkSync(external, join(f.work, '.git/gpui-sync'));
  assert.throws(() => runSync({ cwd: f.work, config: f.config, verifyIdentity: () => {} }), /Unsafe state directory/);
  const g = fixture();
  const state = join(g.work, '.git/gpui-sync');
  mkdirSync(state);
  const outside = join(g.dir, 'ledger.json');
  writeFileSync(outside, 'untouched');
  symlinkSync(outside, join(state, 'unresolved.json'));
  assert.throws(() => runSync({ cwd: g.work, config: g.config, verifyIdentity: () => {} }), /Unsafe state file/);
  assert.equal(readFileSync(outside, 'utf8'), 'untouched');
});

test('unreachable tracked resolution never promotes durable open item', () => {
  const f = fixture();
  const source = cmd(f.source, 'rev-parse', 'HEAD');
  const item = { id: 'port', description: 'port', status: 'open', sourceRange: { from: f.baseline, to: source }, affectedPaths: ['file'], disposition: 'pending', resolutionRevision: null };
  const state = join(f.work, '.git/gpui-sync');
  mkdirSync(state);
  writeFileSync(join(state, 'unresolved.json'), JSON.stringify({ version: 1, channel: 'gpui', items: [item] }));
  const tracked = join(f.work, '.github/gpui-upstream-unresolved.json');
  writeFileSync(tracked, JSON.stringify({ version: 1, channel: 'gpui', items: [{ ...item, status: 'resolved', evidence: 'review', resolutionRevision: source }] }));
  cmd(f.work, 'add', tracked);
  cmd(f.work, 'commit', '-m', 'invalid resolution');
  cmd(f.work, 'push', 'origin', 'HEAD:refs/heads/migration/gpui');
  const options = { cwd: f.work, config: f.config, verifyIdentity: () => {} };
  assert.throws(() => runSync(options), /not reachable/);
  assert.equal(JSON.parse(readFileSync(join(state, 'unresolved.json'), 'utf8')).items[0].status, 'open');
  writeFileSync(tracked, JSON.stringify({ version: 1, channel: 'gpui', items: [item] }));
  cmd(f.work, 'add', tracked);
  cmd(f.work, 'commit', '-m', 'restore open');
  cmd(f.work, 'push', 'origin', 'HEAD:refs/heads/migration/gpui');
  assert.equal(runSync(options).unresolved, 1);
});

test('publication never follows tags and refuses mirror push', () => {
  const f = fixture();
  cmd(f.work, 'fetch', 'upstream', 'refs/heads/native');
  cmd(f.work, 'tag', '-a', 'native-v1', 'FETCH_HEAD', '-m', 'release');
  cmd(f.work, 'config', 'push.followTags', 'true');
  let result;
  const transport = { list: () => result ? [result] : [], create: (repository, branch, base) => {
    result = { headRefName: branch, baseRefName: base, headRefOid: cmd(f.origin, 'rev-parse', `refs/heads/${branch}`), isDraft: true, url: 'https://github.com/example/target/pull/1', headRepositoryOwner: { login: 'example' }, headRepository: { name: 'target' }, body: 'review' };
    return result.url;
  } };
  runSync({ cwd: f.work, config: f.config, verifyIdentity: () => {}, publish: true, transport });
  assert.equal(cmd(f.origin, 'tag', '--list'), '');
  cmd(f.work, 'config', 'remote.origin.mirror', 'true');
  assert.throws(() => runSync({ cwd: f.work, config: f.config, verifyIdentity: () => {} }), /Mirror push is forbidden/);
});

test('candidate PR URL must belong to pinned GitHub repository', () => {
  const f = fixture();
  const source = cmd(f.source, 'rev-parse', 'HEAD');
  const target = cmd(f.work, 'rev-parse', 'HEAD');
  const key = createHash('sha256').update(`${source}:${target}`).digest('hex').slice(0, 20);
  const transport = { list: () => [{ headRefName: `gpui-sync/${key}`, baseRefName: 'migration/gpui', headRefOid: cmd(join(f.work, '.git/gpui-sync/candidates', key), 'rev-parse', 'HEAD'), isDraft: true, url: 'https://enterprise.example/example/target/pull/1', headRepositoryOwner: { login: 'example' }, headRepository: { name: 'target' }, body: 'review' }], create: () => assert.fail('must not create') };
  assert.throws(() => runSync({ cwd: f.work, config: f.config, verifyIdentity: () => {}, publish: true, transport }), /conflicts/);
});

test('closing an existing PR during sync fails without recreating it', () => {
  const f = fixture();
  const source = cmd(f.source, 'rev-parse', 'HEAD');
  const target = cmd(f.work, 'rev-parse', 'HEAD');
  const key = createHash('sha256').update(`${source}:${target}`).digest('hex').slice(0, 20);
  const branch = `gpui-sync/${key}`;
  let lists = 0;
  const transport = { list: () => {
    lists += 1;
    if (lists > 1) return [];
    const head = cmd(join(f.work, '.git/gpui-sync/candidates', key), 'rev-parse', 'HEAD');
    return [{ headRefName: branch, baseRefName: 'migration/gpui', headRefOid: head, isDraft: true, url: 'https://github.com/example/target/pull/1', headRepositoryOwner: { login: 'example' }, headRepository: { name: 'target' }, body: 'review' }];
  }, create: () => assert.fail('must not create') };
  assert.throws(() => runSync({ cwd: f.work, config: f.config, verifyIdentity: () => {}, publish: true, transport }), /Existing PR disappeared/);
  assert.equal(lists, 2);
  assert.equal(cmd(join(f.work, '.git/gpui-sync/candidates', key), 'status', '--porcelain'), '');
});
