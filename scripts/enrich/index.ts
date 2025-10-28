#!/usr/bin/env node
import { enrichEpisodes } from "./enrich";

interface ParsedArgs {
  dryRun: boolean;
  refresh: boolean;
  onlySlug: string | null;
  verbose: boolean;
  cacheOnly: boolean;
  seriesOnly: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    dryRun: false,
    refresh: false,
    onlySlug: null,
    verbose: false,
    cacheOnly: false,
    seriesOnly: false,
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
      case "--series-only":
        args.seriesOnly = true;
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
  console.log(
    [
      "Usage: npm run enrich [options]",
      "",
      "Options:",
      "  --dry-run       Do not write files",
      "  --refresh       Ignore cached inference",
      "  --only <slug>   Enrich a single episode",
      "  --cache-only    Do not call the LLM when cache misses",
      "  --series-only   Update series data without rewriting episodes",
      "  --verbose       Print additional logs",
      "  --help          Show this message",
    ].join("\n")
  );
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
      seriesOnly: args.seriesOnly,
    });
    const summary = result.summary;
    console.log(
      `Series: ${summary.totalSeries} | Episodes: ${summary.totalEpisodes} | Singletons: ${summary.singletonSeries} | ` +
        `LLM calls: ${summary.llmCalls} | Skipped: ${summary.llmSkipped} | Umbrellas: ${summary.umbrellas} | ` +
        `Low confidence: ${summary.lowConfidenceSeries}`
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
