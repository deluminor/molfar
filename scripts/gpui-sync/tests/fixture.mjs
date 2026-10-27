import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

export function cmd(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'gpui-sync-test-'));
  const source = join(dir, 'source');
  const origin = join(dir, 'origin.git');
  const upstream = join(dir, 'upstream.git');
  const work = join(dir, 'work');
  mkdirSync(source);
  cmd(source, 'init', '-b', 'main');
  cmd(source, 'config', 'user.name', 'Fixture');
  cmd(source, 'config', 'user.email', 'fixture@example.com');
  writeFileSync(join(source, 'file.txt'), 'base\n');
  cmd(source, 'add', '.');
  cmd(source, 'commit', '-m', 'base');
  const baseline = cmd(source, 'rev-parse', 'HEAD');
  const config = { sourceRepository: 'example/upstream', sourceBranch: 'native', targetRepository: 'example/target', targetBranch: 'migration/gpui', main: baseline };
  mkdirSync(join(source, '.github'));
  const checkpoint = { version: 1, channel: 'gpui', source: { repository: config.sourceRepository, branch: config.sourceBranch, attempted: baseline, integrated: baseline, validated: null }, target: { repository: config.targetRepository, branch: config.targetBranch, integrated: baseline, validated: null }, upstreamMain: baseline };
  writeFileSync(join(source, '.github/gpui-upstream-sync.json'), JSON.stringify(checkpoint));
  writeFileSync(join(source, '.github/gpui-upstream-unresolved.json'), JSON.stringify({ version: 1, channel: 'gpui', items: [] }));
  cmd(source, 'add', '.');
  cmd(source, 'commit', '-m', 'channel');
  cmd(dir, 'init', '--bare', origin);
  cmd(dir, 'init', '--bare', upstream);
  cmd(source, 'push', origin, 'HEAD:refs/heads/migration/gpui');
  cmd(source, 'push', upstream, `${baseline}:refs/heads/main`, `${baseline}:refs/heads/native`);
  cmd(dir, 'clone', '-b', 'migration/gpui', origin, work);
  cmd(work, 'config', 'user.name', 'Fixture');
  cmd(work, 'config', 'user.email', 'fixture@example.com');
  cmd(work, 'remote', 'set-url', 'origin', 'git@github.com:example/target.git');
  cmd(work, 'remote', 'add', 'upstream', 'git@github.com:example/upstream.git');
  cmd(work, 'config', `url.${origin}.insteadOf`, 'git@github.com:example/target.git');
  cmd(work, 'config', `url.${upstream}.insteadOf`, 'git@github.com:example/upstream.git');
  cmd(source, 'checkout', '-b', 'native', baseline);
  writeFileSync(join(source, 'feature.txt'), 'feature\n');
  cmd(source, 'add', '.');
  cmd(source, 'commit', '-m', 'feature');
  cmd(source, 'push', upstream, 'HEAD:refs/heads/native');
  return { dir, source, origin, upstream, work, config, baseline };
}
