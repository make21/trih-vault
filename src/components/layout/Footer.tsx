import Link from "next/link";

import styles from "./Footer.module.css";

const FEATURED_LINKS = [
  { label: "Fall of the Aztecs series", href: "/series/fall-aztecs-cortes-conquest" },
  { label: "World War II topic", href: "/topics/world-war-ii" },
  { label: "Horatio Nelson", href: "/people/horatio-nelson" },
  { label: "Napoleon Bonaparte", href: "/people/napoleon-bonaparte" },
  { label: "Archduke Franz Ferdinand", href: "/people/archduke-franz-ferdinand" },
  { label: "Kaiser Wilhelm II", href: "/people/kaiser-wilhelm-ii" }
];

const SITE_LINKS = [
  { label: "About", href: "/about" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" }
];

export function Footer(): JSX.Element {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <p className={styles.disclaimer}>
          The Rest Is History Vault is a fan-built side project from a long-time listener who wanted an easier way to
          revisit the archive without endless scrolling.
          <span className={styles.fanNote}>Not associated with Dominic, Tom, Goalhanger, or the official show.</span>
        </p>

        <div className={styles.linkGrid}>
          <div className={styles.section}>
            <p className={styles.heading}>Explore faster</p>
            <ul className={styles.linkList}>
              {FEATURED_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div className={styles.section}>
            <p className={styles.heading}>Site links</p>
            <ul className={styles.linkList}>
              {SITE_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className={styles.meta}>
        <span>© {year} The Rest Is History Vault</span>
        <span>Fan project. Built for fun.</span>
      </div>
    </footer>
  );
}

export default Footer;
