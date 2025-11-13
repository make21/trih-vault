import { trackEvent } from "@/lib/analytics";

interface CommonParams {
  query?: string;
  filters?: Record<string, string | null | undefined>;
}

export const logSearchSubmit = (params: CommonParams & { resultCount: number }): void => {
  trackEvent("search_submit", {
    query: params.query ?? "",
    result_count: params.resultCount,
    filters: params.filters ?? {}
  });
};

export const logSearchResultClick = (
  params: CommonParams & { type: string; slug: string; rank: number }
): void => {
  trackEvent("search_result_click", {
    query: params.query ?? "",
    rank: params.rank,
    type: params.type,
    slug: params.slug,
    filters: params.filters ?? {}
  });
};

export const logFilterChip = (params: { chipType: "person" | "place" | "topic"; chipSlug: string; state: "on" | "off" }) => {
  trackEvent("filter_chip_click", {
    chip_type: params.chipType,
    chip_slug: params.chipSlug,
    state: params.state
  });
};

export const logSearchError = (params: CommonParams & { message: string }): void => {
  trackEvent("search_error", {
    query: params.query ?? "",
    message: params.message,
    filters: params.filters ?? {}
  });
};
