export interface Episode {
  episode: number;
  title_feed: string;
  title_sheet?: string | null;
  pubDate: string;
  description?: string;
  duration?: string | null;
  audio?: string | null;
  eras: string[];
  regions: string[];
  slug: string;
}

export interface RSSItem {
  episode: number;
  title: string;
  pubDate: string;
  description?: string;
  duration?: string | null;
  audio?: string | null;
}

export interface CSVRow {
  episode: number;
  title?: string;
  era: string;
  region: string;
}
