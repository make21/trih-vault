import pLimit from "p-limit";
import { z } from "zod";
import { ScopeSchema } from "./types";

const SYSTEM_PROMPT =
  "Return concise proper-noun umbrella titles (e.g., 'Horatio Nelson'). Avoid generic tags. Provide tight historical year ranges covering the series as a whole. If the series spans centuries, set scope:'broad'.";

export interface SeriesLLMInputEpisode {
  title_feed: string | null;
  title_sheet: string | null;
  description: string | null;
}

export interface SeriesLLMInput {
  provisionalStem: string;
  episodes: SeriesLLMInputEpisode[];
  centuryLabels: string[];
}

export interface SeriesLLMResult {
  seriesTitle: string;
  umbrellaTitle: string;
  yearPrimary: number | null;
  yearFrom: number | null;
  yearTo: number | null;
  scope: z.infer<typeof ScopeSchema>;
  confidence: number | null;
}

const SeriesLLMResponseSchema = z.object({
  seriesTitle: z.string(),
  umbrellaTitle: z.string(),
  yearPrimary: z.number().int().nullable(),
  yearFrom: z.number().int().nullable(),
  yearTo: z.number().int().nullable(),
  scope: ScopeSchema,
  confidence: z.number().min(0).max(1),
});

export interface LLMClient {
  inferSeries(meta: SeriesLLMInput): Promise<SeriesLLMResult>;
}

function buildUserPrompt(meta: SeriesLLMInput): string {
  const payload = {
    provisionalStem: meta.provisionalStem,
    episodes: meta.episodes.map((episode, index) => ({
      index: index + 1,
      title_feed: episode.title_feed,
      title_sheet: episode.title_sheet,
      description: episode.description,
    })),
    centuryLabels: meta.centuryLabels.length ? meta.centuryLabels : null,
  };
  const lines: string[] = [];
  lines.push("Respond with strict JSON matching { \"seriesTitle\": string, \"umbrellaTitle\": string, \"yearPrimary\": number|null, \"yearFrom\": number|null, \"yearTo\": number|null, \"scope\": \"point\"|\"range\"|\"broad\"|\"unknown\", \"confidence\": number }.");
  lines.push("INPUT:");
  lines.push(JSON.stringify(payload, null, 2));
  return lines.join("\n\n");
}

export function createLLMClient(apiKey: string, concurrency = 2): LLMClient {
  const limit = pLimit(concurrency);

  async function invoke(meta: SeriesLLMInput): Promise<SeriesLLMResult> {
    const userPrompt = buildUserPrompt(meta);
    const maxAttempts = 3;
    let lastError: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        try {
          const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              temperature: 0,
              response_format: { type: "json_object" },
              messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: userPrompt },
              ],
              max_tokens: 500,
            }),
            signal: controller.signal,
          });
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
              `OpenAI request failed with status ${response.status}: ${errorText.slice(0, 200)}`,
            );
          }
          const payload = await response.json();
          const message = payload?.choices?.[0]?.message?.content;
          if (!message) {
            throw new Error("No content returned from OpenAI");
          }
          const text = Array.isArray(message)
            ? message.map((item: { text?: string }) => item.text ?? "").join("")
            : message;
          const parsed = JSON.parse(text);
          const validated = SeriesLLMResponseSchema.parse(parsed);
          return {
            seriesTitle: validated.seriesTitle.trim(),
            umbrellaTitle: validated.umbrellaTitle.trim(),
            yearPrimary: validated.yearPrimary ?? null,
            yearFrom: validated.yearFrom ?? null,
            yearTo: validated.yearTo ?? null,
            scope: validated.scope,
            confidence: validated.confidence ?? null,
          };
        } finally {
          clearTimeout(timeout);
        }
      } catch (error) {
        lastError = error;
        const delay = 500 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Failed to contact OpenAI");
  }

  return {
    inferSeries(meta: SeriesLLMInput) {
      return limit(() => invoke(meta));
    },
  };
}
