import { mkdirSync, readFileSync, renameSync, writeFileSync, rmSync, lstatSync } from 'node:fs';
import { join } from 'node:path';

const sha = value => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
const shaOrNull = value => value === null || sha(value);

export function assertRegular(path) {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Unsafe state file: ${path}`);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

export function assertDirectory(path) {
  try {
    const stat = lstatSync(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Unsafe state directory: ${path}`);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

export function ensureDirectory(path) {
  try { mkdirSync(path); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  assertDirectory(path);
}

export function readJson(path) {
  if (!assertRegular(path)) throw new Error(`Missing state file: ${path}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function validateCheckpoint(state, expected) {
  if (state.version !== 1 || state.channel !== 'gpui' || state.source?.repository !== expected.sourceRepository || state.source?.branch !== expected.sourceBranch || state.target?.repository !== expected.targetRepository || state.target?.branch !== expected.targetBranch || state.upstreamMain !== expected.main || !sha(state.source.attempted) || !sha(state.source.integrated) || !shaOrNull(state.source.validated) || !sha(state.target.integrated) || !shaOrNull(state.target.validated)) throw new Error('Invalid checkpoint or channel mismatch');
  return state;
}

export function validateLedger(ledger) {
  if (ledger.version !== 1 || ledger.channel !== 'gpui' || !Array.isArray(ledger.items)) throw new Error('Invalid ledger or channel mismatch');
  const ids = new Set();
  for (const item of ledger.items) {
    if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id) || typeof item.description !== 'string' || !['open', 'resolved'].includes(item.status) || !sha(item.sourceRange?.from) || !sha(item.sourceRange?.to) || !Array.isArray(item.affectedPaths) || !item.affectedPaths.length || item.affectedPaths.some(path => typeof path !== 'string' || !path) || typeof item.disposition !== 'string' || !item.disposition.trim() || (item.status === 'open' && item.resolutionRevision !== null) || (item.status === 'resolved' && (typeof item.evidence !== 'string' || !item.evidence.trim() || !sha(item.resolutionRevision)))) throw new Error('Invalid unresolved item or resolution evidence');
    ids.add(item.id);
  }
  return ledger;
}

export function unionLedger(authoritative, incoming) {
  validateLedger(authoritative);
  validateLedger(incoming);
  const items = new Map(authoritative.items.map(item => [item.id, item]));
  for (const item of incoming.items) {
    const old = items.get(item.id);
    if (old && (JSON.stringify(old.sourceRange) !== JSON.stringify(item.sourceRange) || JSON.stringify(old.affectedPaths) !== JSON.stringify(item.affectedPaths))) throw new Error(`Unresolved item origin changed: ${item.id}`);
    if (!old) items.set(item.id, item);
    else if (old.status === 'open' && item.status === 'resolved') items.set(item.id, item);
  }
  return { version: 1, channel: 'gpui', items: [...items.values()].sort((a, b) => a.id.localeCompare(b.id)) };
}

export function writeJson(path, value) {
  assertRegular(path);
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  renameSync(temporary, path);
}

export function lock(common) {
  const directory = join(common, 'gpui-sync');
  ensureDirectory(directory);
  const path = join(directory, 'lock');
  try { mkdirSync(path); } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`GPUI sync lock exists: ${path}; inspect manually`);
    throw error;
  }
  const inode = lstatSync(path).ino;
  writeFileSync(join(path, 'owner.json'), JSON.stringify({ pid: process.pid, started: new Date().toISOString() }), { flag: 'wx' });
  return { directory, release: () => { if (lstatSync(path).ino !== inode) throw new Error('Lock ownership changed; inspect manually'); rmSync(path, { recursive: true }); } };
}
