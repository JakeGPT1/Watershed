"use client";
import { useEffect } from "react";

/**
 * Clears the ?drafted=<id> param from the URL bar WITHOUT triggering a re-render, so the
 * just-generated blind email stays visible now but a refresh loads a clean /jobs with no draft.
 */
export function StripDraftParam() {
  useEffect(() => {
    window.history.replaceState(null, "", "/jobs");
  }, []);
  return null;
}
