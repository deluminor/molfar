import { execFileSync } from 'node:child_process';

export function git(cwd, ...args) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)));
  return execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }).trim();
}

export function ancestor(cwd, from, to) {
  try {
    git(cwd, 'merge-base', '--is-ancestor', from, to);
    return true;
  } catch (error) {
    if (error.status === 1) return false;
    throw error;
  }
}

export function remoteSha(cwd, remote, ref) {
  const output = git(cwd, 'ls-remote', '--refs', remote, ref);
  const lines = output.split('\n').filter(Boolean);
  if (lines.length > 1) throw new Error(`Ambiguous remote ref: ${remote} ${ref}`);
  return lines.length ? lines[0].split('\t')[0] : null;
}

export function identity(url) {
  const match = url.match(/^(?:https:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/);
  return match?.[1] ?? null;
}
