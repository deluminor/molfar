import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matchesGlob } from 'node:path';
import { test } from 'node:test';

const workflow = readFileSync(new URL('../../.github/workflows/native.yml', import.meta.url), 'utf8');

function eventBlock(name) {
  const match = workflow.match(new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  \\w|^\\S)`, 'm'));
  assert.ok(match, `Missing ${name} event`);
  return match[1];
}

test('native pushes cover the MOLFAR migration target only', () => {
  const branches = eventBlock('push').match(/branches: \[([^\]]+)\]/)[1].split(',').map(value => value.trim());
  assert.deepEqual(branches, ['migration/gpui']);
});

test('native PR checks cover sync logic, checkpoints, native lockfiles and vendor changes', () => {
  const paths = [...eventBlock('pull_request').matchAll(/^      - '([^']+)'$/gm)].map(match => match[1]);
  for (const changed of [
    'scripts/gpui-sync/run.mjs', '.github/gpui-upstream-sync.json',
    '.github/gpui-upstream-unresolved.json', 'crates/monocode-gpui/Cargo.lock',
    'crates/monocode-core/Cargo.toml', 'vendor/portable-pty/Cargo.toml',
    'Cargo.toml', 'Cargo.lock', '.github/workflows/native.yml',
  ]) {
    assert.ok(paths.some(pattern => matchesGlob(changed, pattern)), `Native CI skipped ${changed}`);
  }
  assert.match(workflow, /run: node --test scripts\/gpui-sync\/\*\.test\.mjs/);
  assert.match(workflow, /permissions:\n  contents: read/);
});
