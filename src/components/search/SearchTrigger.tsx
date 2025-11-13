"use client";

import type { ComponentPropsWithoutRef } from "react";

import { trackEvent } from "@/lib/analytics";

import { useSearchOverlay } from "./SearchProvider";
import styles from "./SearchTrigger.module.css";

export interface SearchTriggerProps extends ComponentPropsWithoutRef<"button"> {
  label?: string;
}

export function SearchTrigger({ label = "Search episodes, series, people, places…", className, ...props }: SearchTriggerProps) {
  const { open } = useSearchOverlay();
  const handleClick = () => {
    trackEvent("utility_click", { action: "open_search" });
    open();
  };

  return (
    <button
      type="button"
      className={`${styles.trigger} ${className ?? ""}`}
      onClick={handleClick}
      aria-label="Open search"
      {...props}
    >
      <span role="img" aria-hidden="true">
        🔍
      </span>
      <span>{label}</span>
    </button>
  );
}
