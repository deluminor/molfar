import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { git, ancestor, identity, remoteSha } from './git.mjs';
import { lock, readJson, validateCheckpoint, validateLedger, unionLedger, writeJson, assertRegular, assertDirectory, ensureDirectory } from './state.mjs';
import { github } from './github.mjs';

export const CHANNEL = Object.freeze({ sourceRepository: 'hardbeat920/monocode', sourceBranch: 'mc/migrate-monocode-to-gpui', targetRepository: 'deluminor/molfar', targetBranch: 'migration/gpui', main: '26465c620977f3951d0a532a0f7db32c3c179007' });
const CHECKPOINT = '.github/gpui-upstream-sync.json';
const LEDGER = '.github/gpui-upstream-unresolved.json';
const PROTECTED = /^(?:\.github\/(?:workflows\/|gpui-upstream-)|scripts\/(?:gpui-sync\/|package-native\.mjs$|build-native\.mjs$|bundle-native-macos\.sh$|native-release\.mjs$|native-installer\.nsi$)|src-tauri\/Entitlements\.plist$|\.changeset(?:\/|$))|(?:^|\/)(?:release|publish|publishing|credentials?|secrets?)(?:[-_.\/]|$)/i;
const ref = branch => `refs/heads/${branch}`;
const openSnapshot = ledger => ({ ...ledger, items: ledger.items.map(item => item.status === 'resolved' ? { ...item, status: 'open', resolutionRevision: null } : item) });

function requireIdentity(cwd, remote, repository) {
  for (const args of [['get-url', '--all', remote], ['get-url', '--push', '--all', remote]]) {
    const urls = git(cwd, 'remote', ...args).split('\n');
    if (!urls.length || urls.some(url => identity(url) !== repository)) throw new Error(`Unexpected ${remote} remote identity`);
  }
}

function sourceRefs(cwd, config) {
  for (const [remote, branch, local] of [['upstream', config.sourceBranch, 'source'], ['upstream', 'main', 'main'], ['origin', config.targetBranch, 'target']]) {
    git(cwd, 'fetch', '--no-tags', '--no-write-fetch-head', remote, `+${ref(branch)}:refs/gpui-sync/${local}`);
  }
  return Object.fromEntries(['source', 'main', 'target'].map(name => [name, git(cwd, 'rev-parse', `refs/gpui-sync/${name}`)]));
}

function finalRefs(cwd, config, frozen) {
  if (remoteSha(cwd, 'upstream', ref(config.sourceBranch)) !== frozen.source || remoteSha(cwd, 'upstream', ref('main')) !== frozen.main || remoteSha(cwd, 'origin', ref(config.targetBranch)) !== frozen.target) throw new Error('Remote source, main or target changed during sync');
}

function validatePrs(prs, branch, base, head, repository) {
  if (!Array.isArray(prs)) throw new Error('Malformed PR response');
  if (prs.length >= 1000) throw new Error('PR list may be truncated; refusing publication');
  if (prs.some(pr => typeof pr?.headRefName !== 'string' || typeof pr.baseRefName !== 'string')) throw new Error('Malformed PR response');
  prs = prs.filter(pr => pr.headRefName === branch || (pr.headRefName?.startsWith('gpui-sync/') && pr.baseRefName === base));
  if (prs.length > 1) throw new Error('Multiple open PRs for candidate');
  if (!prs.length) return null;
  const pr = prs[0];
  const [owner, name] = repository.split('/');
  const prefix = `https://github.com/${repository}/pull/`;
  const validUrl = typeof pr.url === 'string' && pr.url.startsWith(prefix) && /^[1-9][0-9]*$/.test(pr.url.slice(prefix.length));
  if (pr.headRefName !== branch || pr.baseRefName !== base || pr.headRefOid !== head || pr.isDraft !== true || !validUrl || pr.headRepositoryOwner?.login !== owner || pr.headRepository?.name !== name || typeof pr.body !== 'string' || /(?:co-authored-by|generated-by|assisted-by|generated with|made with)/i.test(pr.body)) throw new Error('Existing PR conflicts with candidate or target');
  return pr.url;
}

export function runSync({ cwd, publish = false, config = CHANNEL, transport = github, verifyIdentity = requireIdentity }) {
  cwd = resolve(cwd);
  const common = resolve(cwd, git(cwd, 'rev-parse', '--git-common-dir'));
  const held = lock(common);
  try {
    if (git(cwd, 'status', '--porcelain', '--untracked-files=normal')) throw new Error('Checkout is dirty');
    verifyIdentity(cwd, 'origin', config.targetRepository);
    verifyIdentity(cwd, 'upstream', config.sourceRepository);
    try {
      if (git(cwd, 'config', '--bool', '--get', 'remote.origin.mirror') === 'true') throw new Error('Mirror push is forbidden');
    } catch (error) {
      if (error.status !== 1) throw error;
    }
    if (!assertDirectory(join(cwd, '.github'))) throw new Error('Missing .github directory');
    const checkpoint = validateCheckpoint(readJson(join(cwd, CHECKPOINT)), config);
    const trackedLedger = validateLedger(readJson(join(cwd, LEDGER)));
    const ledgerPath = join(held.directory, 'unresolved.json');
    let ledger = assertRegular(ledgerPath) ? validateLedger(readJson(ledgerPath)) : { version: 1, channel: 'gpui', items: [] };
    ledger = unionLedger(ledger, openSnapshot(trackedLedger));
    writeJson(ledgerPath, ledger);
    const frozen = sourceRefs(cwd, config);
    const targetCheckpoint = validateCheckpoint(JSON.parse(git(cwd, 'show', `${frozen.target}:${CHECKPOINT}`)), config);
    if (JSON.stringify(targetCheckpoint) !== JSON.stringify(checkpoint)) throw new Error('Checkout checkpoint differs from target');
    const targetLedger = validateLedger(JSON.parse(git(cwd, 'show', `${frozen.target}:${LEDGER}`)));
    ledger = unionLedger(ledger, openSnapshot(targetLedger));
    writeJson(ledgerPath, ledger);
    ledger = unionLedger(unionLedger(ledger, trackedLedger), targetLedger);
    for (const item of ledger.items.filter(item => item.status === 'resolved')) {
      if (!ancestor(cwd, item.resolutionRevision, frozen.target)) throw new Error(`Resolution revision is not reachable from target: ${item.id}`);
    }
    writeJson(ledgerPath, ledger);
    if (frozen.main !== config.main) throw new Error(`Upstream main changed: ${frozen.main}; cutover requires review`);
    if (!ancestor(cwd, checkpoint.source.integrated, frozen.source) || !ancestor(cwd, checkpoint.source.attempted, frozen.source)) throw new Error('Source rewrite or checkpoint mismatch');
    if (!ancestor(cwd, checkpoint.source.integrated, frozen.target) || !ancestor(cwd, checkpoint.target.integrated, frozen.target)) throw new Error('Target checkpoint is unreachable');
    const attemptsPath = join(held.directory, 'attempt.json');
    if (assertRegular(attemptsPath)) {
      const prior = readJson(attemptsPath);
      if (prior.version !== 1 || prior.channel !== 'gpui' || !/^[0-9a-f]{40}$/.test(prior.source) || !ancestor(cwd, prior.source, frozen.source)) throw new Error('Attempt history mismatch or source rewrite');
    }
    writeJson(attemptsPath, { version: 1, channel: 'gpui', source: frozen.source, target: frozen.target });
    const changed = git(cwd, 'diff', '--name-only', '--no-renames', '-z', checkpoint.source.integrated, frozen.source).split('\0').filter(Boolean);
    const protectedPaths = changed.filter(path => PROTECTED.test(path));
    if (protectedPaths.length) throw new Error(`Protected upstream paths require separate review: ${protectedPaths.join(', ')}`);
    if (frozen.source !== checkpoint.source.integrated && ancestor(cwd, frozen.source, frozen.target)) throw new Error('Source already reachable from target; reconcile integration checkpoint');
    if (!publish || frozen.source === checkpoint.source.integrated) return { mode: 'inspect', ...frozen, changed: changed.length, unresolved: ledger.items.filter(item => item.status === 'open').length };
    const key = createHash('sha256').update(`${frozen.source}:${frozen.target}`).digest('hex').slice(0, 20);
    const branch = `gpui-sync/${key}`;
    const candidate = join(held.directory, 'candidates', key);
    const recordPath = join(held.directory, `candidate-${key}.json`);
    let head;
    ensureDirectory(join(held.directory, 'candidates'));
    if (assertRegular(recordPath)) {
      if (!assertDirectory(candidate)) throw new Error('Retained candidate directory is missing');
    }
    if (assertRegular(recordPath)) {
      const record = readJson(recordPath);
      if (record.source !== frozen.source || record.target !== frozen.target || record.branch !== branch || !/^[0-9a-f]{40}$/.test(record.head) || git(candidate, 'rev-parse', 'HEAD') !== record.head || git(candidate, 'status', '--porcelain')) throw new Error('Retained candidate changed; inspect manually');
      head = record.head;
      const snapshot = validateLedger(JSON.parse(git(candidate, 'show', `${head}:${LEDGER}`)));
      if (JSON.stringify(unionLedger(ledger, snapshot)) !== JSON.stringify(snapshot)) throw new Error('Retained candidate ledger is stale; inspect manually');
    } else {
      if (assertDirectory(candidate)) throw new Error('Candidate directory already exists; inspect manually');
      ensureDirectory(join(held.directory, 'candidates'));
      git(cwd, 'worktree', 'add', '--detach', candidate, frozen.target);
      try { git(candidate, 'merge', '--no-ff', '--no-commit', frozen.source); } catch (error) {
        const conflicts = git(candidate, 'diff', '--name-only', '--diff-filter=U', '-z').split('\0').filter(Boolean);
        if (conflicts.length) {
          const entries = conflicts.map(path => ({ id: `conflict:${frozen.source}:${path}`, description: `Merge conflict: ${path}`, status: 'open', sourceRange: { from: checkpoint.source.integrated, to: frozen.source }, affectedPaths: [path], disposition: 'manual review required', resolutionRevision: null }));
          ledger = unionLedger(ledger, { version: 1, channel: 'gpui', items: entries });
          writeJson(ledgerPath, ledger);
        }
        throw new Error(`Candidate merge failed and retained at ${candidate}: ${error.message}`);
      }
      if (!assertDirectory(join(candidate, '.github'))) throw new Error('Candidate .github directory is missing');
      const candidateState = structuredClone(checkpoint);
      candidateState.source.attempted = frozen.source;
      writeJson(join(candidate, CHECKPOINT), candidateState);
      writeJson(join(candidate, LEDGER), ledger);
      git(candidate, 'add', '--', CHECKPOINT, LEDGER);
      git(candidate, 'commit', '-m', `chore(gpui): propose upstream sync ${frozen.source.slice(0, 12)}`);
      head = git(candidate, 'rev-parse', 'HEAD');
      writeJson(recordPath, { version: 1, channel: 'gpui', source: frozen.source, target: frozen.target, branch, head });
    }
    finalRefs(cwd, config, frozen);
    const remoteHead = remoteSha(cwd, 'origin', ref(branch));
    if (remoteHead && remoteHead !== head) throw new Error('Remote candidate branch differs; refusing overwrite');
    let pr = validatePrs(transport.list(config.targetRepository), branch, config.targetBranch, head, config.targetRepository);
    finalRefs(cwd, config, frozen);
    if (remoteSha(cwd, 'origin', ref(branch)) !== remoteHead) throw new Error('Remote candidate head changed');
    if (!remoteHead) git(candidate, 'push', '--no-follow-tags', 'origin', `${head}:${ref(branch)}`);
    finalRefs(cwd, config, frozen);
    if (remoteSha(cwd, 'origin', ref(branch)) !== head) throw new Error('Remote candidate head changed');
    const currentPr = validatePrs(transport.list(config.targetRepository), branch, config.targetBranch, head, config.targetRepository);
    if (pr && !currentPr) throw new Error('Existing PR disappeared during sync');
    pr = currentPr;
    if (!pr) {
      finalRefs(cwd, config, frozen);
      if (remoteSha(cwd, 'origin', ref(branch)) !== head) throw new Error('Remote candidate head changed');
      const created = transport.create(config.targetRepository, branch, config.targetBranch, frozen.source, frozen.target);
      pr = validatePrs(transport.list(config.targetRepository), branch, config.targetBranch, head, config.targetRepository);
      if (!pr || pr !== created) throw new Error('Created PR could not be verified');
    }
    return { mode: 'publish', ...frozen, branch, head, candidate, pr };
  } finally {
    held.release();
  }
}
