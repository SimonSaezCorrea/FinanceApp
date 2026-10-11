import { type ReactNode, useRef, useState } from "react";

import { ApiRequestError } from "@finance/client";

import { StepUpPanel } from "../components/StepUpPanel";

/**
 * Verify-first actions driven by the server (specs/032): the action runs; if the API answers
 * `STEP_UP_REQUIRED`, the step-up panel opens (TOTP or a passkey when the account has one, the
 * password only when it has neither) and, once verified, the same action runs again. The server
 * decides when it is needed, so nothing here tracks the 5-minute window.
 */
export function useStepUp(description: string): {
  /** True when `error` means "verify first"; then the action is retried after verification. */
  needsStepUp: (error: unknown, retry: () => void) => boolean;
  stepUpPanel: ReactNode;
} {
  const [open, setOpen] = useState(false);
  const retryRef = useRef<(() => void) | null>(null);

  function needsStepUp(error: unknown, retry: () => void): boolean {
    if (!(error instanceof ApiRequestError) || error.code !== "STEP_UP_REQUIRED") return false;
    retryRef.current = retry;
    setOpen(true);
    return true;
  }

  const stepUpPanel = (
    <StepUpPanel
      open={open}
      // The panel closes itself BEFORE reporting success, so closing must not drop the retry; a
      // cancelled one is simply replaced by the next request.
      onOpenChange={setOpen}
      description={description}
      onVerified={() => {
        const retry = retryRef.current;
        retryRef.current = null;
        setOpen(false);
        retry?.();
      }}
    />
  );

  return { needsStepUp, stepUpPanel };
}
