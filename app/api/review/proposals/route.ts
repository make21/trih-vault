import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { slugify } from "@/lib/slug/slugify";

export const dynamic = "force-dynamic";

const DATA_DIR = path.join(process.cwd(), "data");
const ERRORS_PATH = path.join(DATA_DIR, "errors.jsonl");
const EPISODES_PROGRAMMATIC_PATH = path.join(
  DATA_DIR,
  "episodes-programmatic.json",
);
const REVIEWS_PATH = path.join(DATA_DIR, "pending", "reviews.jsonl");
const PEOPLE_PATH = path.join(DATA_DIR, "rules", "people.json");
const PLACES_PATH = path.join(DATA_DIR, "rules", "places.json");
const TOPICS_PATH = path.join(DATA_DIR, "rules", "topics.json");

type RegistrySummary = {
  id: string;
  preferredName: string;
};

type ProposalItem = {
  label: string;
  id?: string;
  notes?: string | null;
};

type AggregatedProposal = {
  itemId: string;
  title: string;
  stage: string;
  when: string;
  proposals: {
    type: "person" | "place" | "topic";
    items: ProposalItem[];
  }[];
};

const PERSON_MSG = "LLM proposed new or unknown person(s)";
const PLACE_MSG = "LLM proposed new or unknown place(s)";
const TOPIC_MSG = "LLM proposed new topic(s)";

const safeJsonParse = (line: string) => {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
};

export async function GET() {
  const [
    errorsRaw,
    episodesRaw,
    peopleRaw,
    placesRaw,
    topicsRaw,
    reviewsRaw,
  ] = await Promise.all([
    readFile(ERRORS_PATH, "utf8"),
    readFile(EPISODES_PROGRAMMATIC_PATH, "utf8"),
    readFile(PEOPLE_PATH, "utf8"),
    readFile(PLACES_PATH, "utf8"),
    readFile(TOPICS_PATH, "utf8"),
    readFile(REVIEWS_PATH, "utf8").catch(() => ""),
  ]);

  const episodesProgrammatic = JSON.parse(episodesRaw);
  const peopleRegistry: RegistrySummary[] = JSON.parse(peopleRaw).map(
    (entry: any) => ({
      id: entry.id,
      preferredName: entry.preferredName,
    }),
  );
  const placesRegistry: RegistrySummary[] = JSON.parse(placesRaw).map(
    (entry: any) => ({
      id: entry.id,
      preferredName: entry.preferredName,
    }),
  );
  const topicsRegistry: RegistrySummary[] = JSON.parse(topicsRaw).map(
    (entry: any) => ({
      id: entry.id,
      preferredName: entry.preferredName ?? entry.label,
    }),
  );

  const topicMappings = extractTopicMappings(reviewsRaw);
  const personResolver = buildResolver(JSON.parse(peopleRaw));
  const placeResolver = buildResolver(JSON.parse(placesRaw));
  const topicResolver = buildResolver(JSON.parse(topicsRaw));
  const aggregated: Record<string, AggregatedProposal> = {};

  errorsRaw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(safeJsonParse)
    .filter(Boolean)
    .forEach((entry: any) => {
      const message: string = entry.message ?? "";
      const itemId: string | undefined = entry.itemId;
      if (!itemId) return;

      const stage = entry.stage ?? "unknown";
      const when = entry.when ?? "";
      const title =
        episodesProgrammatic[itemId]?.cleanTitle ??
        episodesProgrammatic[itemId]?.title ??
        itemId;

      if (!aggregated[itemId]) {
        aggregated[itemId] = {
          itemId,
          title,
          stage,
          when,
          proposals: [],
        };
      }

      const addItems = (
        type: "person" | "place" | "topic",
        items: ProposalItem[],
        known: (item: ProposalItem) => boolean,
      ) => {
        const unresolved = items.filter((item) => !known(item));
        if (!unresolved.length) return;
        const existing = aggregated[itemId].proposals.find(
          (p) => p.type === type,
        );
        if (existing) {
          const existingLabels = new Set(
            existing.items.map((i) => i.label.toLowerCase()),
          );
          unresolved.forEach((item) => {
            const key = item.label.toLowerCase();
            if (!existingLabels.has(key)) {
              existing.items.push(item);
              existingLabels.add(key);
            }
          });
        } else {
          aggregated[itemId].proposals.push({ type, items: unresolved });
        }
      };

      if (message === PERSON_MSG) {
        const items =
          entry.details?.personProposal?.map((p: any) => ({
            label: p.label,
          })) ?? [];
        addItems("person", items, (item) => isKnownEntity(item, personResolver));
      } else if (message === PLACE_MSG) {
        const items =
          entry.details?.placeProposal?.map((p: any) => ({
            label: p.label,
          })) ?? [];
        addItems("place", items, (item) => isKnownEntity(item, placeResolver));
      } else if (message === TOPIC_MSG) {
        const items =
          entry.details?.topicProposal?.map((p: any) => ({
            label: p.label,
            id: p.id,
            notes: p.notes ?? null,
          })) ?? [];
        addItems("topic", items, (item) =>
          isKnownTopic(item, topicResolver, topicMappings),
        );
      }

      if (
        aggregated[itemId].proposals.every(
          (group) => group.items.length === 0,
        )
      ) {
        delete aggregated[itemId];
      }
    });

  return NextResponse.json({
    proposals: Object.values(aggregated).sort((a, b) =>
      a.title.localeCompare(b.title),
    ),
    registries: {
      people: peopleRegistry,
      places: placesRegistry,
      topics: topicsRegistry,
    },
  });
}

type Resolver = {
  tokens: Set<string>;
};

const buildResolver = (registry: any[]): Resolver => {
  const tokens = new Set<string>();
  registry.forEach((entry) => {
    const add = (value?: string) => {
      if (!value) return;
      tokens.add(value.toLowerCase());
      tokens.add(slugify(value));
    };
    add(entry.id);
    add(entry.preferredName);
    add(entry.label);
    add(entry.slug);
    (entry.aliases ?? []).forEach((alias: string) => add(alias));
  });
  return { tokens };
};

const isKnownEntity = (proposal: ProposalItem, resolver: Resolver) => {
  const label = proposal.label ?? "";
  const slug = slugify(label);
  return (
    resolver.tokens.has(label.toLowerCase()) ||
    resolver.tokens.has(slug.toLowerCase())
  );
};

const isKnownTopic = (
  proposal: ProposalItem,
  resolver: Resolver,
  topicMappings: Map<string, string>,
) => {
  const label = proposal.label ?? "";
  const slug = slugify(label);
  const proposalId = proposal.id ?? slug;
  if (topicMappings.has(proposalId)) {
    return true;
  }
  return (
    resolver.tokens.has(label.toLowerCase()) ||
    resolver.tokens.has(slug.toLowerCase()) ||
    resolver.tokens.has(proposalId.toLowerCase())
  );
};

const extractTopicMappings = (reviewsRaw: string) => {
  const mappings = new Map<string, string>();
  if (!reviewsRaw) return mappings;
  reviewsRaw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(safeJsonParse)
    .filter(Boolean)
    .forEach((entry: any) => {
      const mapEntry = entry.topicsMapped;
      if (!mapEntry) return;
      Object.entries(mapEntry).forEach(([from, to]) => {
        mappings.set(from, String(to));
      });
    });
  return mappings;
};
