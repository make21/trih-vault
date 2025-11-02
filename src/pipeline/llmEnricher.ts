import createOpenAiClient, {
  ChatMessage,
  OpenAiClient,
  ChatCompletionResult
} from "@/lib/openai";
import {
  ErrorLedgerEntry,
  LlmEpisodeCacheEntry,
  LlmSeriesCacheEntry,
  ProgrammaticEpisode,
  ProgrammaticSeries,
  YearConfidence
} from "@/types";

interface LlmOptions {
  client?: OpenAiClient;
  maxLlmCalls?: number;
  now?: () => Date;
  forceIds?: Set<string>;
  planOnly?: boolean;
}

interface EpisodeEnrichmentResult {
  cache: Record<string, LlmEpisodeCacheEntry>;
  errors: ErrorLedgerEntry[];
  callsMade: number;
  planned: { episodeId: string; fingerprint: string }[];
}

interface SeriesEnrichmentResult {
  cache: Record<string, LlmSeriesCacheEntry>;
  errors: ErrorLedgerEntry[];
  callsMade: number;
  planned: { seriesId: string; fingerprint: string }[];
}

const EPISODE_PROMPT_VERSION = "episode.enrichment.v1";
const SERIES_PROMPT_VERSION = "series.enrichment.v1";

const EPISODE_SYSTEM_MESSAGE: ChatMessage = {
  role: "system",
  content:
    "You are an expert historical analyst specializing in 'The Rest Is History' podcast. Your task is to extract specific structured metadata from an episode's title and synopsis. You must adhere strictly to the output format."
};

const SERIES_SYSTEM_MESSAGE: ChatMessage = {
  role: "system",
  content:
    "You are a skilled editor tasked with creating a compelling title and summary for a multi-part podcast series based on the titles and synopses of its individual episodes."
};

const sanitizeArray = (values: unknown[], maxItems?: number): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed) || (maxItems && result.length >= maxItems)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }

  return result;
};

const toKebabCase = (value: string): string | null => {
  const lower = value.toLowerCase();
  const replaced = lower.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-+/g, "-");
  return replaced || null;
};

const sanitizeThemes = (values: unknown[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    const normalised = toKebabCase(value);
    if (!normalised || seen.has(normalised)) {
      continue;
    }
    result.push(normalised);
    seen.add(normalised);
    if (result.length >= 8) {
      break;
    }
  }

  return result;
};

const toJsonArrayString = (value: unknown): string => JSON.stringify(value, null, 2);

const normaliseEpisodeCacheEntry = (entry: LlmEpisodeCacheEntry): LlmEpisodeCacheEntry => ({
  ...entry,
  keyThemes: sanitizeThemes(entry.keyThemes ?? [])
});

const cleanJsonFence = (content: string): string => {
  const trimmed = content.trim();
  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```json\s*/i, "").replace(/^```/, "").replace(/```$/i, "").trim();
  }
  return trimmed;
};

const buildEpisodeUserMessage = (episode: ProgrammaticEpisode): ChatMessage => ({
  role: "user",
  content: [
    "Analyze the following podcast episode details:",
    `Title: ${episode.cleanTitle}`,
    `Synopsis: ${episode.cleanDescriptionText}`,
    "From the text provided, perform the following tasks:",
    "Identify key historical figures mentioned. Do NOT include the hosts, Tom Holland and Dominic Sandbrook. Do NOT include producer or staff names mentioned in a credits list.",
    "Identify key geographical places or locations central to the narrative.",
    "Infer a numeric year span (yearFrom, yearTo) for the main historical period discussed. If the episode covers multiple distinct periods or no specific historical period (e.g., mythology, ghosts), you MUST return `null` for both yearFrom and yearTo.",
    "Extract up to five short, key themes or topics that summarize the episode's subject matter.",
    "Return your analysis ONLY as a single, valid JSON object with the following schema:",
    '{',
    '  "keyPeople": ["string"],',
    '  "keyPlaces": ["string"],',
    '  "keyThemes": ["string"],',
    '  "yearFrom": number | null,',
    '  "yearTo": number | null',
    "}",
    "Example:",
    "Input:",
    "Title: 612. Nelson: The Final Showdown (Part 5)",
    'Synopsis: "After two years at sea chasing the combined fleet of France and Spain, what was Nelson’s next step? Upon returning to his beloved Emma, how was the heroic Nelson received? What was the terrifying Napoleon Bonaparte scheming for his fleet across the seas? And, would Britain finally face an imminent French invasion, and with it apocalypse - for both Britain and Nelson himself? Join Dominic and Tom as they discuss the build up to one of the most totemic naval clashes of all time - Trafalgar - and Nelson; the man behind it all."',
    "Expected Output:",
    "{",
    '  "keyPeople": ["Horatio Nelson", "Emma Hamilton", "Napoleon Bonaparte"],',
    '  "keyPlaces": ["Britain", "France", "Spain", "Trafalgar"],',
    '  "keyThemes": ["Napoleonic Wars", "Naval Warfare", "British Navy", "French Invasion Threat", "Trafalgar Campaign"],',
    '  "yearFrom": 1803,',
    '  "yearTo": 1805',
    "}",
    "If a span cannot be determined, both `yearFrom` and `yearTo` must be returned as `null`:",
    "{",
    '  "keyPeople": ["Perseus", "Medusa"],',
    '  "keyPlaces": ["Ancient Greece"],',
    '  "keyThemes": ["mythology", "heroic-quests", "monsters"],',
    '  "yearFrom": null,',
    '  "yearTo": null',
    "}"
  ].join("\n")
});

const buildSeriesUserMessage = (series: ProgrammaticSeries): ChatMessage => {
  const summaries = series.derived?.episodeSummaries ?? [];
  return {
    role: "user",
    content: [
      "Analyze the following collection of podcast episodes, which belong to a single series:",
      "JSON",
      toJsonArrayString(
        summaries.map((summary) => ({
          part: summary.part,
          cleanTitle: summary.cleanTitle,
          cleanDescriptionText: summary.cleanDescriptionText
        }))
      ),
      "Based on the provided episodes, generate a single, consolidated `seriesTitle` and a short `narrativeSummary` (2-3 sentences) for the entire series. The title should be a human-friendly, overarching name for the arc, derived from the common themes in the episode titles.",
      "Return your analysis ONLY as a single, valid JSON object with the following schema:",
      "{",
      '  "seriesTitle": "string",',
      '  "narrativeSummary": "string"',
      "}"
    ].join("\n")
  };
};

const createErrorEntry = (
  stage: string,
  itemId: string,
  level: ErrorLedgerEntry["level"],
  message: string,
  details?: Record<string, unknown>
): ErrorLedgerEntry => ({
  stage,
  itemId,
  when: new Date().toISOString(),
  level,
  message,
  details: details ?? null
});

const parseJsonContent = (content: string): unknown => {
  const cleaned = cleanJsonFence(content);
  return JSON.parse(cleaned);
};

const ensureYear = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const parsed = Math.trunc(value);
  // Accept extended historical spans (e.g. 5000 BC = -4999) while guarding against wild outputs.
  if (parsed < -9999 || parsed > 9999) {
    return null;
  }

  return parsed;
};

const normaliseYearConfidence = (value: unknown): YearConfidence => {
  if (value === "high" || value === "medium" || value === "low" || value === "unknown") {
    return value;
  }
  return "unknown";
};

const defaultNow = () => new Date();

const resolveModelName = (response: ChatCompletionResult | null | undefined): string => {
  if (response?.model && response.model.length > 0) {
    return response.model;
  }
  return process.env.OPENAI_MODEL_PRIMARY ?? "gpt-5-nano";
};

export const runLlmEpisodeEnrichment = async (
  programmaticEpisodes: Record<string, ProgrammaticEpisode>,
  existingCache: Record<string, LlmEpisodeCacheEntry>,
  options: LlmOptions = {}
): Promise<EpisodeEnrichmentResult> => {
  const planOnly = options.planOnly ?? false;
  const client = planOnly ? null : options.client ?? createOpenAiClient();
  const errors: ErrorLedgerEntry[] = [];
  const updatedCache: Record<string, LlmEpisodeCacheEntry> = {};

  Object.entries(existingCache).forEach(([cacheKey, entry]) => {
    updatedCache[cacheKey] = normaliseEpisodeCacheEntry(entry);
  });
  const now = options.now ?? defaultNow;
  const maxCalls =
    options.maxLlmCalls === undefined || options.maxLlmCalls === null || options.maxLlmCalls < 0
      ? Number.POSITIVE_INFINITY
      : options.maxLlmCalls;
  let remainingCalls = maxCalls;
  let callsMade = 0;
  const planned: { episodeId: string; fingerprint: string }[] = [];

  const episodes = Object.values(programmaticEpisodes).sort((a, b) => {
    const dateDiff = new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime();
    return dateDiff !== 0 ? dateDiff : a.episodeId.localeCompare(b.episodeId);
  });

  for (const episode of episodes) {
    const cacheKey = `${episode.episodeId}:${episode.fingerprint}`;
    const shouldForce = options.forceIds?.has(episode.episodeId) ?? false;

    if (updatedCache[cacheKey] && !shouldForce) {
      continue;
    }

    if (shouldForce) {
      delete updatedCache[cacheKey];
    }

    if (planOnly) {
      planned.push({ episodeId: episode.episodeId, fingerprint: episode.fingerprint });
      continue;
    }

    if (remainingCalls <= 0) {
      errors.push(
        createErrorEntry("llm:episodes", episode.episodeId, "info", "Skipped LLM enrichment due to max call limit", {
          cacheKey
        })
      );
      continue;
    }

    const messages = [EPISODE_SYSTEM_MESSAGE, buildEpisodeUserMessage(episode)];

    let response: ChatCompletionResult | null = null;
    try {
      if (!client) {
        throw new Error("LLM client unavailable in plan mode");
      }

      response = await client.chatCompletion({ messages });
      callsMade += 1;
      remainingCalls -= 1;
    } catch (error) {
      errors.push(
        createErrorEntry(
          "llm:episodes",
          episode.episodeId,
          "error",
          "OpenAI request failed",
          error instanceof Error ? { cacheKey, error: error.message } : { cacheKey }
        )
      );
      updatedCache[cacheKey] = normaliseEpisodeCacheEntry({
        episodeId: episode.episodeId,
        fingerprint: episode.fingerprint,
        model: resolveModelName(null),
        promptVersion: EPISODE_PROMPT_VERSION,
        createdAt: now().toISOString(),
        status: "error",
        notes: error instanceof Error ? error.message : "Unknown error",
        keyPeople: [],
        keyPlaces: [],
        keyThemes: [],
        yearFrom: null,
        yearTo: null,
        yearConfidence: "unknown"
      });
      continue;
    }

    try {
      const parsed = parseJsonContent(response.content) as Record<string, unknown>;
      const keyPeople = sanitizeArray((parsed.keyPeople as unknown[]) ?? [], 12);
      const keyPlaces = sanitizeArray((parsed.keyPlaces as unknown[]) ?? [], 12);
      const keyThemes = sanitizeThemes((parsed.keyThemes as unknown[]) ?? []);

      const entry: LlmEpisodeCacheEntry = normaliseEpisodeCacheEntry({
        episodeId: episode.episodeId,
        fingerprint: episode.fingerprint,
        model: response.model,
        promptVersion: EPISODE_PROMPT_VERSION,
        createdAt: now().toISOString(),
        status: "ok",
        notes: null,
        keyPeople,
        keyPlaces,
        keyThemes,
        yearFrom: ensureYear(parsed.yearFrom),
        yearTo: ensureYear(parsed.yearTo),
        yearConfidence: normaliseYearConfidence(parsed.yearConfidence ?? "unknown")
      });

      updatedCache[cacheKey] = entry;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to parse LLM response";
      errors.push(
        createErrorEntry("llm:episodes", episode.episodeId, "error", message, {
          cacheKey,
          raw: response?.content
        })
      );
      updatedCache[cacheKey] = normaliseEpisodeCacheEntry({
        episodeId: episode.episodeId,
        fingerprint: episode.fingerprint,
        model: resolveModelName(response),
        promptVersion: EPISODE_PROMPT_VERSION,
        createdAt: now().toISOString(),
        status: "error",
        notes: message,
        keyPeople: [],
        keyPlaces: [],
        keyThemes: [],
        yearFrom: null,
        yearTo: null,
        yearConfidence: "unknown"
      });
    }
  }

  return {
    cache: updatedCache,
    errors,
    callsMade,
    planned
  };
};

export const runLlmSeriesEnrichment = async (
  programmaticSeries: Record<string, ProgrammaticSeries>,
  existingCache: Record<string, LlmSeriesCacheEntry>,
  options: LlmOptions = {}
): Promise<SeriesEnrichmentResult> => {
  const planOnly = options.planOnly ?? false;
  const client = planOnly ? null : options.client ?? createOpenAiClient();
  const errors: ErrorLedgerEntry[] = [];
  const updatedCache: Record<string, LlmSeriesCacheEntry> = { ...existingCache };
  const now = options.now ?? defaultNow;
  const maxCalls =
    options.maxLlmCalls === undefined || options.maxLlmCalls === null || options.maxLlmCalls < 0
      ? Number.POSITIVE_INFINITY
      : options.maxLlmCalls;
  let remainingCalls = maxCalls;
  let callsMade = 0;
  const planned: { seriesId: string; fingerprint: string }[] = [];

  const seriesList = Object.values(programmaticSeries).sort((a, b) =>
    a.seriesId.localeCompare(b.seriesId)
  );

  for (const series of seriesList) {
    const cacheKey = `${series.seriesId}:${series.fingerprint}`;
    const shouldForce = options.forceIds?.has(series.seriesId) ?? false;

    if (updatedCache[cacheKey] && !shouldForce) {
      continue;
    }

    if (shouldForce) {
      delete updatedCache[cacheKey];
    }

    if ((series.derived?.episodeSummaries?.length ?? 0) === 0) {
      errors.push(
        createErrorEntry(
          "llm:series",
          series.seriesId,
          "warn",
          "Series lacks episode summaries; skipping enrichment",
          { cacheKey }
        )
      );
      continue;
    }

    if (planOnly) {
      planned.push({ seriesId: series.seriesId, fingerprint: series.fingerprint });
      continue;
    }

    if (remainingCalls <= 0) {
      errors.push(
        createErrorEntry("llm:series", series.seriesId, "info", "Skipped LLM enrichment due to max call limit", {
          cacheKey
        })
      );
      continue;
    }

    const messages = [SERIES_SYSTEM_MESSAGE, buildSeriesUserMessage(series)];

    let response: ChatCompletionResult | null = null;
    try {
      if (!client) {
        throw new Error("LLM client unavailable in plan mode");
      }

      response = await client.chatCompletion({ messages });
      callsMade += 1;
      remainingCalls -= 1;
    } catch (error) {
      errors.push(
        createErrorEntry(
          "llm:series",
          series.seriesId,
          "error",
          "OpenAI request failed",
          error instanceof Error ? { cacheKey, error: error.message } : { cacheKey }
        )
      );
      updatedCache[cacheKey] = {
        seriesId: series.seriesId,
        fingerprint: series.fingerprint,
        model: resolveModelName(null),
        promptVersion: SERIES_PROMPT_VERSION,
        createdAt: now().toISOString(),
        status: "error",
        notes: error instanceof Error ? error.message : "Unknown error",
        seriesTitle: null,
        narrativeSummary: null,
        tonalDescriptors: null,
        yearFrom: series.yearFrom ?? null,
        yearTo: series.yearTo ?? null,
        yearConfidence: series.yearConfidence ?? "unknown"
      };
      continue;
    }

    try {
      const parsed = parseJsonContent(response.content) as Record<string, unknown>;
      const seriesTitle =
        typeof parsed.seriesTitle === "string" && parsed.seriesTitle.trim().length > 0
          ? parsed.seriesTitle.trim()
          : series.seriesTitleFallback;
      const narrativeSummary =
        typeof parsed.narrativeSummary === "string" && parsed.narrativeSummary.trim().length > 0
          ? parsed.narrativeSummary.trim()
          : null;
      const tonalDescriptors =
        "tonalDescriptors" in parsed
          ? sanitizeArray((parsed.tonalDescriptors as unknown[]) ?? [])
          : null;

      const entry: LlmSeriesCacheEntry = {
        seriesId: series.seriesId,
        fingerprint: series.fingerprint,
        model: response.model,
        promptVersion: SERIES_PROMPT_VERSION,
        createdAt: now().toISOString(),
        status: "ok",
        notes: null,
        seriesTitle,
        narrativeSummary,
        tonalDescriptors,
        yearFrom: series.yearFrom ?? null,
        yearTo: series.yearTo ?? null,
        yearConfidence: series.yearConfidence ?? "unknown"
      };

      updatedCache[cacheKey] = entry;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to parse LLM response";
      errors.push(
        createErrorEntry("llm:series", series.seriesId, "error", message, {
          cacheKey,
          raw: response?.content
        })
      );
      updatedCache[cacheKey] = {
        seriesId: series.seriesId,
        fingerprint: series.fingerprint,
        model: resolveModelName(response),
        promptVersion: SERIES_PROMPT_VERSION,
        createdAt: now().toISOString(),
        status: "error",
        notes: message,
        seriesTitle: series.seriesTitleFallback,
        narrativeSummary: null,
        tonalDescriptors: null,
        yearFrom: series.yearFrom ?? null,
        yearTo: series.yearTo ?? null,
        yearConfidence: series.yearConfidence ?? "unknown"
      };
    }
  }

  return {
    cache: updatedCache,
    errors,
    callsMade,
    planned
  };
};
