import Link from "next/link";

import styles from "./FindAndListen.module.css";

const PROVIDERS = [
  { name: "Official site", href: "https://therestishistory.com/episodes/" },
  { name: "Apple Podcasts", href: "https://podcasts.apple.com/us/podcast/the-rest-is-history/id1537788786" },
  { name: "Spotify", href: "https://open.spotify.com/show/7Cvsbcjhtur7nplC148TWy" },
  { name: "YouTube", href: "https://www.youtube.com/@restishistorypod/podcasts" }
] as const;

export interface FindAndListenProps {
  title?: string;
  className?: string;
}

const classNames = (...values: Array<string | false | null | undefined>) =>
  values.filter(Boolean).join(" ");

export function FindAndListen({ title = "Find and listen", className }: FindAndListenProps): JSX.Element {
  return (
    <section className={classNames(styles.container, className)}>
      <h2 className={styles.title}>{title}</h2>
      <div className={styles.links}>
        {PROVIDERS.map((provider) => (
          <Link
            key={provider.name}
            href={provider.href}
            className={styles.link}
            rel="noopener noreferrer"
            target="_blank"
            data-analytics-context="listen_links"
          >
            {provider.name}
          </Link>
        ))}
      </div>
    </section>
  );
}

export default FindAndListen;
