import type { Metadata } from "next";

import { StaticPageLayout } from "@/components/detail";

import styles from "../static-pages.module.css";

export const metadata: Metadata = {
  title: "Terms — The Rest Is History Vault",
  description: "Lightweight terms of use for this unofficial fan-built vault."
};

export default function TermsPage(): JSX.Element {
  return (
    <StaticPageLayout
      title="Terms of Service"
      subtitle="Use this fan-built reference at your own discretion. It’s a hobby project, not a commercial platform."
    >
      <div className={styles.stack}>
        <p>
          By browsing The Rest Is History Vault you agree to the simple rules below. They exist purely to keep the
          project running smoothly and to protect the podcasters whose work inspired it.
        </p>
        <ul>
          <li>This site is provided “as is” with no warranties. Data is curated carefully but may contain errors.</li>
          <li>
            Do not use the vault to impersonate the hosts, Goalhanger, or anyone associated with the official podcast.
          </li>
          <li>Respect the official RSS feed, paid products, and any applicable copyright on podcast artwork or audio.</li>
          <li>
            If you find an issue (broken link, incorrect mapping, missing context) please open an issue or reach out so
            it can be fixed for everyone.
          </li>
        </ul>
        <div className={styles.callout}>
          The Rest Is History Vault is an independent fan experience maintained by the community. It is not affiliated
          with Dominic Sandbrook, Tom Holland, Goalhanger, or the official Rest Is History team. All trademarks belong
          to their respective owners.
        </div>
      </div>
    </StaticPageLayout>
  );
}
