import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { github } from '../lib/github.mjs';

test('GitHub adapter pins github.com despite inherited GH_HOST', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gpui-gh-test-'));
  const log = join(dir, 'args');
  const executable = join(dir, 'gh');
  writeFileSync(executable, '#!/bin/sh\nprintf "%s\\n" "$GH_HOST" "$@" >> "$GPUI_TEST_LOG"\nif [ "$2" = list ]; then printf "[]"; else printf "https://github.com/example/target/pull/1"; fi\n');
  chmodSync(executable, 0o700);
  const original = { path: process.env.PATH, host: process.env.GH_HOST, log: process.env.GPUI_TEST_LOG };
  process.env.PATH = `${dir}:${original.path}`;
  process.env.GH_HOST = 'enterprise.example';
  process.env.GPUI_TEST_LOG = log;
  try {
    assert.deepEqual(github.list('example/target'), []);
    assert.equal(github.create('example/target', 'gpui-sync/test', 'migration/gpui', 'a'.repeat(40), 'b'.repeat(40)), 'https://github.com/example/target/pull/1');
    const lines = readFileSync(log, 'utf8').split('\n');
    assert.equal(lines.filter(line => line === 'enterprise.example').length, 2);
    assert.equal(lines.filter(line => line === 'github.com/example/target').length, 2);
    assert.equal(lines.filter(line => line === '--repo').length, 2);
  } finally {
    for (const [key, value] of Object.entries({ PATH: original.path, GH_HOST: original.host, GPUI_TEST_LOG: original.log })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
