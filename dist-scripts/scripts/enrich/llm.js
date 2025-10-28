"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLLMClient = createLLMClient;
const p_limit_1 = __importDefault(require("p-limit"));
const types_1 = require("./types");
const umbrellas_1 = require("./umbrellas");
const SYSTEM_PROMPT = [
    "You are a careful historical classifier.",
    "Infer years only from widely known historical anchors implicit in the text (e.g., people, wars, battles).",
    "Prefer tight ranges. If the topic spans many centuries, set scope:\"broad\".",
    "If uncertain, lower confidence and leave years null rather than guessing.",
    "Choose umbrellas only from the provided list unless an extra is clearly warranted.",
].join(" ");
function safeField(value) {
    return value === null ? "null" : JSON.stringify(value);
}
function buildUserPrompt(meta) {
    const lines = [
        "Provide JSON only (no prose).",
        "",
        "INPUT:",
        `title_feed: ${safeField(meta.title_feed)}`,
        `title_sheet: ${safeField(meta.title_sheet)}`,
        `description: ${safeField(meta.description)}`,
        `series_hint: ${meta.seriesHint ? JSON.stringify(meta.seriesHint) : "null"}`,
        `known_century_label: ${safeField(meta.knownCenturyLabel)}`,
        "",
        "OUTPUT SHAPE:",
        '{',
        '  "seriesTitle": string | null,',
        '  "seriesPart": number | null,',
        '  "yearPrimary": number | null,',
        '  "yearFrom": number | null,',
        '  "yearTo": number | null,',
        '  "scope": "point" | "range" | "broad" | "unknown",',
        '  "umbrellas": string[],',
        '  "confidence": number,',
        '  "rationale": string',
        "}",
    ];
    return lines.join("\n");
}
function createLLMClient(apiKey, concurrency = 2) {
    const limit = (0, p_limit_1.default)(concurrency);
    async function invoke(meta) {
        const userPrompt = buildUserPrompt(meta);
        const maxAttempts = 3;
        let lastError;
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
                            max_tokens: 600,
                        }),
                        signal: controller.signal,
                    });
                    if (!response.ok) {
                        const errorText = await response.text();
                        throw new Error(`OpenAI request failed with status ${response.status}: ${errorText.slice(0, 200)}`);
                    }
                    const payload = await response.json();
                    const message = payload?.choices?.[0]?.message?.content;
                    if (!message) {
                        throw new Error("No content returned from OpenAI");
                    }
                    const text = Array.isArray(message)
                        ? message.map((item) => item.text ?? "").join("")
                        : message;
                    const parsed = JSON.parse(text);
                    const validated = types_1.LLMInferenceSchema.parse(parsed);
                    const sanitized = {
                        seriesTitle: validated.seriesTitle,
                        seriesPart: validated.seriesPart ?? null,
                        yearPrimary: validated.yearPrimary ?? null,
                        yearFrom: validated.yearFrom ?? null,
                        yearTo: validated.yearTo ?? null,
                        scope: validated.scope,
                        umbrellas: (0, umbrellas_1.sanitizeUmbrellas)(validated.umbrellas ?? []),
                        confidence: validated.confidence,
                    };
                    return sanitized;
                }
                finally {
                    clearTimeout(timeout);
                }
            }
            catch (error) {
                lastError = error;
                const delay = 500 * 2 ** attempt;
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
        throw lastError instanceof Error ? lastError : new Error("Failed to contact OpenAI");
    }
    return {
        inferEpisode(meta) {
            return limit(() => invoke(meta));
        },
    };
}
