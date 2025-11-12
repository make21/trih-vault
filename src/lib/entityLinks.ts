import { findPerson } from "@/config/people";
import { findPlace } from "@/config/places";
import { findTopic, findTopicBySlug } from "@/config/topics";
import { slugify } from "@/lib/slug/slugify";

const sanitiseFallback = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "entry";

const resolveSlug = (candidate: string): string => {
  const slug = slugify(candidate);
  return slug || sanitiseFallback(candidate);
};

export const getPersonSlug = (name: string, id?: string | null): string => {
  if (id) {
    return id;
  }
  const match = findPerson(name);
  if (match) {
    return match.id;
  }
  return resolveSlug(name);
};

export const getPersonHref = (name: string, id?: string | null): string =>
  `/people/${encodeURIComponent(getPersonSlug(name, id))}`;

export const getPlaceSlug = (name: string, id?: string | null): string => {
  if (id) {
    return id;
  }
  const match = findPlace(name);
  if (match) {
    return match.id;
  }
  return resolveSlug(name);
};

export const getPlaceHref = (name: string, id?: string | null): string =>
  `/places/${encodeURIComponent(getPlaceSlug(name, id))}`;

export const getTopicSlug = (slugOrId: string): string => {
  const match = findTopicBySlug(slugOrId) ?? findTopic(slugOrId);
  if (match) {
    return match.slug;
  }
  return resolveSlug(slugOrId);
};

export const getTopicHref = (slugOrId: string): string =>
  `/topics/${encodeURIComponent(getTopicSlug(slugOrId))}`;
