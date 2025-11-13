export type SearchDocumentType = "episode" | "series" | "entity";
export type SearchEntityType = "person" | "place" | "topic";

export interface SearchEntityRef {
  id: string;
  label: string;
}

export interface SearchTopicRef extends SearchEntityRef {
  slug?: string;
}

export interface SearchDocument {
  id: string;
  type: SearchDocumentType;
  entityType?: SearchEntityType;
  slug: string;
  title: string;
  summary: string;
  description?: string;
  keywordsText: string;
  yearRange?: string | null;
  badge?: string;
  seriesSlug?: string | null;
  seriesTitle?: string | null;
  people?: SearchEntityRef[];
  places?: SearchEntityRef[];
  topics?: SearchEntityRef[];
  publishedAt?: string;
}

export interface SearchResult extends SearchDocument {
  score: number;
  match?: string[];
  rank?: number;
}

export interface SearchFilters {
  person?: string | null;
  place?: string | null;
  topic?: string | null;
}

export type SearchStatus = "idle" | "loading" | "ready" | "error";

export interface FacetSuggestion {
  id: string;
  label: string;
  count: number;
}

export interface SearchFacets {
  people: FacetSuggestion[];
  places: FacetSuggestion[];
  topics: FacetSuggestion[];
}
