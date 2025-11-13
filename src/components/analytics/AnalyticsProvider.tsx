"use client";

import { useEffect } from "react";

import { trackEvent } from "@/lib/analytics";

export function AnalyticsProvider(): null {
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || !anchor.href) {
        return;
      }
      try {
        const url = new URL(anchor.href, window.location.href);
        if (url.origin !== window.location.origin) {
          trackEvent("outbound_click", {
            hostname: url.hostname,
            path: url.pathname,
            context: anchor.dataset.analyticsContext ?? "global"
          });
        }
      } catch {
        // ignore parsing failures
      }
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return null;
}

export default AnalyticsProvider;
