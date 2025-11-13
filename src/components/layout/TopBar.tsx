"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useSearchOverlay } from "@/components/search/SearchProvider";

import styles from "./TopBar.module.css";

interface TopBarProps {
  latestEpisode?: { title: string; slug: string };
}

export function TopBar({ latestEpisode }: TopBarProps): JSX.Element {
  const { open } = useSearchOverlay();
  const pathname = usePathname();
  const showBackLink = pathname !== "/";

  return (
    <div className={styles.topBar}>
      {showBackLink ? (
        <Link href="/" className={styles.homeLink}>
          ← Timeline
        </Link>
      ) : latestEpisode ? (
        <div className={styles.latest}>
          <span className={styles.latestLabel}>Latest:</span>
          <Link href={`/episode/${latestEpisode.slug}`} className={styles.latestLink}>
            {latestEpisode.title}
          </Link>
        </div>
      ) : (
        <span className={styles.homeLink}>The Rest Is History Explorer</span>
      )}
      {pathname !== "/" ? (
        <button type="button" className={styles.searchButton} onClick={open} aria-label="Open search">
          <span role="img" aria-hidden="true">
            🔍
          </span>
          <span className={styles.label}>Search</span>
        </button>
      ) : null}
    </div>
  );
}
