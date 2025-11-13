"use client";

import type { ComponentPropsWithoutRef } from "react";

import { useSearchOverlay } from "./SearchProvider";
import styles from "./SearchTrigger.module.css";

export interface SearchTriggerProps extends ComponentPropsWithoutRef<"button"> {
  label?: string;
}

export function SearchTrigger({ label = "Search episodes, series, people, places…", className, ...props }: SearchTriggerProps) {
  const { open } = useSearchOverlay();

  return (
    <button
      type="button"
      className={`${styles.trigger} ${className ?? ""}`}
      onClick={open}
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
