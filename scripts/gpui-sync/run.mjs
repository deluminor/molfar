#!/usr/bin/env node
import { runSync } from './lib/channel.mjs';

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--publish')) {
  process.stderr.write('Usage: node scripts/gpui-sync/run.mjs [--publish]\n');
  process.exitCode = 2;
} else {
  try {
    process.stdout.write(`${JSON.stringify(runSync({ cwd: process.cwd(), publish: args[0] === '--publish' }), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`GPUI sync refused: ${error.message}\n`);
    process.exitCode = 1;
  }
}
