export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, appendFile } from "fs/promises";
import path from "path";
import { slugify } from "@/lib/slug/slugify";

const DATA_DIR = path.join(process.cwd(), "data");
const PEOPLE_PATH = path.join(DATA_DIR, "rules", "people.json");
const PLACES_PATH = path.join(DATA_DIR, "rules", "places.json");
const TOPICS_PATH = path.join(DATA_DIR, "rules", "topics.json");
const REVIEWS_PATH = path.join(DATA_DIR, "pending", "reviews.jsonl");
const REVIEW_TOKEN = process.env.REVIEW_TOKEN;

const unauthorized = () =>
  NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

const isAuthorized = (request: NextRequest) => {
  if (!REVIEW_TOKEN) return false;
  return request.headers.get("x-review-token") === REVIEW_TOKEN;
};

type EntityType = "person" | "place" | "topic";
type ActionType = "accept" | "reject" | "map";

const nowIso = () => new Date().toISOString();

const readRegistry = async (filePath: string) =>
  JSON.parse(await readFile(filePath, "utf8"));

const writeRegistry = async (filePath: string, data: unknown) =>
  writeFile(filePath, JSON.stringify(data, null, 2));

const appendReviewLog = async (entry: Record<string, unknown>) => {
  await appendFile(REVIEWS_PATH, `${JSON.stringify(entry)}\n`, "utf8");
};

const ensureUniqueId = (registry: any[], id: string) => {
  if (registry.some((entry) => entry.id === id)) {
    throw new Error(`ID '${id}' already exists in registry.`);
  }
};

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return unauthorized();
  }
  const body = await req.json();
  const action: ActionType = body.action;
  const entityType: EntityType = body.entityType;
  const proposal = body.proposal;
  const data = body.data ?? {};

  try {
    if (action === "accept") {
      await handleAccept(entityType, proposal, data);
    } else if (action === "reject") {
      await handleReject(entityType, proposal, data);
    } else if (action === "map") {
      await handleMap(entityType, proposal, data);
    } else {
      throw new Error(`Unsupported action '${action}'.`);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 400 },
    );
  }
}

async function handleAccept(
  entityType: EntityType,
  proposal: any,
  data: any,
) {
  if (entityType === "person") {
    const people = await readRegistry(PEOPLE_PATH);
    const id = data.id ?? slugify(data.preferredName ?? proposal.label);
    ensureUniqueId(people, id);
    people.push({
      id,
      preferredName: data.preferredName ?? proposal.label,
      aliases: data.aliases ?? [],
      type: data.type ?? "person:historical",
    });
    people.sort((a: any, b: any) => a.id.localeCompare(b.id));
    await writeRegistry(PEOPLE_PATH, people);
    await appendReviewLog({
      reviewedAt: nowIso(),
      reviewedBy: "review-ui",
      batch: "review-ui-accept",
      peopleAccepted: [id],
      notes: `Accepted person '${id}' from proposal '${proposal.label}'.`,
    });
  } else if (entityType === "place") {
    const places = await readRegistry(PLACES_PATH);
    const id = data.id ?? slugify(data.preferredName ?? proposal.label);
    ensureUniqueId(places, id);
    places.push({
      id,
      preferredName: data.preferredName ?? proposal.label,
      aliases: data.aliases ?? [],
      type: data.type ?? "place",
    });
    places.sort((a: any, b: any) => a.id.localeCompare(b.id));
    await writeRegistry(PLACES_PATH, places);
    await appendReviewLog({
      reviewedAt: nowIso(),
      reviewedBy: "review-ui",
      batch: "review-ui-accept",
      placesAccepted: [id],
      notes: `Accepted place '${id}' from proposal '${proposal.label}'.`,
    });
  } else {
    const topics = await readRegistry(TOPICS_PATH);
    const id =
      data.id ?? slugify(data.preferredName ?? data.label ?? proposal.label);
    ensureUniqueId(topics, id);
    topics.push({
      id,
      preferredName: data.preferredName ?? proposal.label,
      label: data.label ?? proposal.label,
      slug: data.slug ?? id,
      aliases: data.aliases ?? [],
      type: data.type ?? "theme",
      description: data.description ?? "",
    });
    topics.sort((a: any, b: any) => a.id.localeCompare(b.id));
    await writeRegistry(TOPICS_PATH, topics);
    await appendReviewLog({
      reviewedAt: nowIso(),
      reviewedBy: "review-ui",
      batch: "review-ui-accept",
      topicsAccepted: [id],
      notes: `Accepted topic '${id}' from proposal '${proposal.label}'.`,
    });
  }
}

async function handleReject(
  entityType: EntityType,
  proposal: any,
  data: any,
) {
  const reviewedAt = nowIso();
  const reviewedBy = "review-ui";
  const batch = "review-ui-reject";
  const label = proposal.id ?? proposal.label;

  if (entityType === "person") {
    await appendReviewLog({
      reviewedAt,
      reviewedBy,
      batch,
      peopleRejected: [label],
      notes: data.reason ?? `Rejected person proposal '${proposal.label}'.`,
    });
  } else if (entityType === "place") {
    await appendReviewLog({
      reviewedAt,
      reviewedBy,
      batch,
      placesRejected: [label],
      notes: data.reason ?? `Rejected place proposal '${proposal.label}'.`,
    });
  } else {
    await appendReviewLog({
      reviewedAt,
      reviewedBy,
      batch,
      topicsRejected: [label],
      notes: data.reason ?? `Rejected topic proposal '${proposal.label}'.`,
    });
  }
}

async function handleMap(entityType: EntityType, proposal: any, data: any) {
  if (entityType === "topic") {
    if (!data.targetId) {
      throw new Error("targetId is required to map a topic.");
    }
    await appendReviewLog({
      reviewedAt: nowIso(),
      reviewedBy: "review-ui",
      batch: "review-ui-map",
      topicsMapped: {
        [proposal.id ?? slugify(proposal.label)]: data.targetId,
      },
      notes: `Mapped topic '${proposal.label}' to '${data.targetId}'.`,
    });
    return;
  }

  if (!data.targetId) {
    throw new Error("targetId is required to map this proposal.");
  }

  const registryPath =
    entityType === "person" ? PEOPLE_PATH : PLACES_PATH;
  const registry = await readRegistry(registryPath);
  const target = registry.find((entry: any) => entry.id === data.targetId);
  if (!target) {
    throw new Error(`Target ${entityType} '${data.targetId}' not found.`);
  }

  target.aliases = Array.from(
    new Set([...(target.aliases ?? []), proposal.label]),
  );
  registry.sort((a: any, b: any) => a.id.localeCompare(b.id));
  await writeRegistry(registryPath, registry);
  await appendReviewLog({
    reviewedAt: nowIso(),
    reviewedBy: "review-ui",
    batch: "review-ui-map",
    notes: `Mapped ${entityType} '${proposal.label}' to existing '${data.targetId}' by adding alias.`,
  });
}
