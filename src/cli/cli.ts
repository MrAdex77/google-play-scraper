import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import gplay from '../index.js';
import { GooglePlayError, ValidationError } from '../core/errors.js';
import { commands } from './commands.js';
import type { CliApi, CliCommand, CliValues } from './commands.js';

export interface CliIo {
  out: (text: string) => void;
  err: (text: string) => void;
}

const BIN_NAME = 'google-play-scraper';

const packageJsonSchema = z.object({ version: z.string() });

const PACKAGE_JSON_CANDIDATES = ['../package.json', '../../package.json'];

async function readVersion(): Promise<string> {
  for (const candidate of PACKAGE_JSON_CANDIDATES) {
    let raw: string;
    try {
      raw = await readFile(new URL(candidate, import.meta.url), 'utf8');
    } catch {
      continue;
    }
    return packageJsonSchema.parse(JSON.parse(raw)).version;
  }
  throw new GooglePlayError('unable to locate package.json for --version');
}

function renderHelp(): string {
  const width = Math.max(...commands.map((command) => command.name.length));
  const lines = [
    `Usage: ${BIN_NAME} <command> [argument] [flags]`,
    '',
    'Commands:',
    ...commands.map((command) => `  ${command.name.padEnd(width)}  ${command.summary}`),
    '',
    `Run "${BIN_NAME} <command> --help" for the flags of one command.`,
    'Base flags for every command: --lang <code>, --country <code>, --throttle <requestsPerSecond>',
    'Global flags: --help, --version',
  ];
  return lines.join('\n');
}

function commandUsage(command: CliCommand): string {
  return `Usage: ${BIN_NAME} ${command.usage}`;
}

function usageFailure(io: CliIo, message: string, command: CliCommand | undefined): 2 {
  io.err(`${BIN_NAME}: ${message}\n`);
  io.err(`${command === undefined ? renderHelp() : commandUsage(command)}\n`);
  return 2;
}

function isParseArgsError(error: unknown): error is TypeError & { code: string } {
  return (
    error instanceof TypeError &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code.startsWith('ERR_PARSE_ARGS')
  );
}

export async function runCli(
  argv: readonly string[],
  io: CliIo,
  api: CliApi = gplay,
): Promise<0 | 1 | 2> {
  const [first, ...rest] = argv;
  if (first === undefined) {
    io.err(`${renderHelp()}\n`);
    return 2;
  }
  if (first === '--help' || first === '-h') {
    io.out(`${renderHelp()}\n`);
    return 0;
  }
  if (first === '--version') {
    io.out(`${await readVersion()}\n`);
    return 0;
  }
  const command = commands.find((entry) => entry.name === first);
  if (command === undefined) {
    return usageFailure(io, `unknown command "${first}"`, undefined);
  }
  let positionals: string[];
  let values: CliValues;
  try {
    const parsed = parseArgs({
      args: rest,
      options: { ...command.options, help: { type: 'boolean', short: 'h' } },
      strict: true,
      allowPositionals: true,
    });
    positionals = parsed.positionals;
    values = parsed.values;
  } catch (error) {
    if (isParseArgsError(error)) {
      return usageFailure(io, error.message, command);
    }
    throw error;
  }
  if (values.help === true) {
    io.out(`${commandUsage(command)}\n`);
    return 0;
  }
  const positional = positionals[0];
  if (command.requiresPositional && positional === undefined) {
    return usageFailure(io, `${command.name}: missing required argument`, command);
  }
  const expectedPositionals = command.requiresPositional ? 1 : 0;
  if (positionals.length > expectedPositionals) {
    const unexpected = positionals[expectedPositionals] ?? '';
    return usageFailure(io, `${command.name}: unexpected argument "${unexpected}"`, command);
  }
  try {
    const result = await command.execute(positional ?? '', values, api);
    io.out(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    if (error instanceof ValidationError) {
      return usageFailure(io, error.message, command);
    }
    const message = error instanceof Error ? error.message : String(error);
    io.err(`${BIN_NAME}: ${message}\n`);
    return 1;
  }
}
