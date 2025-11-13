import type { Metadata } from "next";

import { StaticPageLayout } from "@/components/detail";

import styles from "../static-pages.module.css";

export const metadata: Metadata = {
  title: "Privacy — The Rest Is History Vault",
  description: "Plain-language privacy details for this fan-built site."
};

export default function PrivacyPage(): JSX.Element {
  return (
    <StaticPageLayout
      title="Privacy Policy"
      subtitle="This fan site keeps things lightweight—no accounts, trackers, or behavioural profiling."
    >
      <div className={styles.stack}>
        <p>
          The Rest Is History Vault is a static site backed by deterministic JSON files. It does not accept user
          submissions, run forms, or ask for personal information. Visiting the site is equivalent to loading any other
          static page on the web.
        </p>
        <p>
          Basic server logs (handled by the hosting provider) may capture anonymised request data such as IP address,
          user-agent, and timestamp for the sole purpose of operating the service and preventing abuse. These logs are
          automatically rotated by the host and are never pulled into a separate database.
        </p>
        <p>
          The site does embed Google Analytics (`G-R3VK4GWFD4`) so we can understand how visitors use the Vault, which
          sections they explore, and whether the search/timeline interactions meet our expectations. This data is
          collected anonymously—no login data or device identifiers are stored—and it helps prioritise future
          improvements. We still do not deploy any third-party cookies, advertising trackers, or behavioural profiling
          scripts beyond this simple analytics layer.
        </p>
        <p>
          If you have questions or need something removed, reach out to the maintainers through the contact channels
          shared with collaborators or via the site’s published support instructions.
        </p>
        <div className={styles.callout}>
          tl;dr — browse freely. This project stores no personal data beyond the transient infrastructure logs required
          to keep the site online.
        </div>
      </div>
    </StaticPageLayout>
  );
}
