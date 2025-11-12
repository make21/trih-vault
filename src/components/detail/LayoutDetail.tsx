import Link from "next/link";
import { type ReactNode } from "react";

import { PillLink } from "./PillLink";
import styles from "./LayoutDetail.module.css";

export interface BreadcrumbItem {
  label: string;
  href: string;
}

export interface LayoutDetailProps {
  title: string;
  subtitle?: ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  hideBreadcrumbs?: boolean;
  heroVariant?: "default" | "condensed";
}

const classNames = (...values: Array<string | false | null | undefined>) =>
  values.filter(Boolean).join(" ");

export function LayoutDetail({
  title,
  subtitle,
  breadcrumbs = [],
  meta,
  actions,
  children,
  hideBreadcrumbs = false,
  heroVariant = "default"
}: LayoutDetailProps): JSX.Element {
  const hasSupportingHeroContent = Boolean(subtitle || meta || actions);
  const useCondensedHero =
    heroVariant === "condensed" || (!hasSupportingHeroContent && heroVariant === "default");

  return (
    <div className={styles.page}>
      {!hideBreadcrumbs && breadcrumbs.length > 0 ? (
        <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
          {breadcrumbs.map((crumb, index) => (
            <span key={crumb.href}>
              {index > 0 ? <span aria-hidden="true">/</span> : null}
              <Link href={crumb.href}>{crumb.label}</Link>
            </span>
          ))}
        </nav>
      ) : null}
      <header className={classNames(styles.hero, useCondensedHero && styles.heroCondensed)}>
        <h1 className={styles.heroTitle}>{title}</h1>
        {subtitle ? <div className={styles.heroSubtitle}>{subtitle}</div> : null}
        {meta ? <div className={styles.metaRow}>{meta}</div> : null}
        {actions ? <div>{actions}</div> : null}
      </header>

      <main className={styles.content}>{children}</main>

      <footer className={styles.content}>
        <PillLink href="/" variant="series">
          ← Back to timeline
        </PillLink>
      </footer>
    </div>
  );
}

export default LayoutDetail;
