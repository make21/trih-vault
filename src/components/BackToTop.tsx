"use client";

import { useEffect, useState } from "react";

import { trackEvent } from "@/lib/analytics";

export default function BackToTop(): JSX.Element | null {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 800);
    };

    window.addEventListener("scroll", onScroll);
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <button
      type="button"
      style={{
        position: "fixed",
        bottom: "1rem",
        right: "1rem",
        padding: "0.5rem 0.75rem",
        borderRadius: "0.5rem",
        border: "1px solid #d4d4d4",
        background: "#fff",
        cursor: "pointer"
      }}
      onClick={() => {
        trackEvent("utility_click", { action: "back_to_top" });
        window.scrollTo({ top: 0, behavior: "smooth" });
      }}
    >
      ↑ Top
    </button>
  );
}
