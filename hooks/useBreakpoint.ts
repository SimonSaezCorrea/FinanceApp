"use client";

import { useEffect, useState } from "react";

/** Matches Tailwind `md` breakpoint (768px). */
export function useIsMdUp() {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => setOk(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return ok;
}
