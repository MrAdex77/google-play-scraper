#!/usr/bin/env node
import { runCli } from './cli.js';

process.exitCode = await runCli(process.argv.slice(2), {
  out: (text) => {
    process.stdout.write(text);
  },
  err: (text) => {
    process.stderr.write(text);
  },
});
