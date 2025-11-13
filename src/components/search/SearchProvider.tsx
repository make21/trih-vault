"use client";

import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { SearchIndexProvider } from "@/lib/search/useSearchIndex";

const LazySearchOverlay = dynamic(() => import("./SearchOverlay"), {
  ssr: false,
  loading: () => null
});

interface OverlayContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const OverlayContext = createContext<OverlayContextValue | undefined>(undefined);

export const useSearchOverlay = (): OverlayContextValue => {
  const context = useContext(OverlayContext);
  if (!context) {
    throw new Error("useSearchOverlay must be used within a SearchProvider");
  }
  return context;
};

export function SearchProvider({ children }: { children: ReactNode }): JSX.Element {
  const [isMounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      document.body.classList.remove("search-overlay-open");
      return;
    }
    document.body.classList.add("search-overlay-open");
    return () => {
      document.body.classList.remove("search-overlay-open");
    };
  }, [isOpen]);

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const value = useMemo(
    () => ({
      isOpen,
      open,
      close
    }),
    [isOpen, open, close]
  );

  return (
    <SearchIndexProvider>
      <OverlayContext.Provider value={value}>
        {children}
        {isMounted ? <LazySearchOverlay /> : null}
      </OverlayContext.Provider>
    </SearchIndexProvider>
  );
}
