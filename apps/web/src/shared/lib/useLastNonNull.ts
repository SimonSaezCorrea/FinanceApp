import { useState } from "react";

/**
 * Keeps the last non-null value after the caller clears it.
 *
 * For overlays whose content comes from the same state that opens them
 * (`open={selected !== null}` + `if (!selected) return null`): clearing the
 * selection unmounts the whole surface on the spot, so the exit animation never
 * gets to run and the dialog vanishes instead of leaving. Rendering the retained
 * value instead lets Radix keep the node alive for its `data-[state=closed]`
 * animation and unmount when that finishes.
 *
 * Stored with a render-phase `setState` (React's documented "adjusting state
 * when a prop changes" escape hatch) rather than in an effect: the retained value
 * is needed by THIS render, and an effect would show one frame of the old content
 * before catching up.
 */
export function useLastNonNull<T>(value: T | null | undefined): T | null {
  const [retained, setRetained] = useState<T | null>(value ?? null);

  if (value != null && value !== retained) {
    setRetained(value);
    return value;
  }

  return value ?? retained;
}
