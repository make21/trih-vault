#!/usr/bin/env node
import { enrichEpisodes } from "./enrich";

interface ParsedArgs {
  dryRun: boolean;
  refresh: boolean;
  onlySlug: string | null;
  verbose: boolean;
  cacheOnly: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    dryRun: false,
    refresh: false,
    onlySlug: null,
    verbose: false,
    cacheOnly: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    switch (value) {
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--refresh":
        args.refresh = true;
        break;
      case "--verbose":
        args.verbose = true;
        break;
      case "--cache-only":
        args.cacheOnly = true;
        break;
      case "--only":
        args.onlySlug = argv[i + 1] ?? null;
        if (!args.onlySlug) {
          throw new Error("--only requires a slug argument");
        }
        i += 1;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        if (value.startsWith("--")) {
          throw new Error(`Unknown flag: ${value}`);
        }
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage: npm run enrich [options]\n\nOptions:\n  --dry-run       Do not write files\n  --refresh       Ignore cached inference\n  --only <slug>   Enrich a single episode\n  --cache-only    Do not call the LLM when cache misses\n  --verbose       Print additional logs\n  --help          Show this message`);
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = await enrichEpisodes({
      dryRun: args.dryRun,
      refresh: args.refresh,
      onlySlug: args.onlySlug,
      verbose: args.verbose,
      cacheOnly: args.cacheOnly,
    });
    const summary = result.summary;
    console.log(
      `Episodes: ${summary.totalEpisodes} | Series: ${summary.totalSeries} | LLM calls: ${summary.llmCalls} | ` +
        `Skipped: ${summary.llmSkipped} | Unknown: ${summary.lowConfidence.unknown} | Broad: ${summary.lowConfidence.broad}`
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
