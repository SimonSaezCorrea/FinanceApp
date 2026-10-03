import { auth } from "@finance/contracts";

import type { SessionStepUpPort } from "../../session/domain/ports/session-step-up.port";
import { StepUpRequiredError } from "../domain/errors";

const WINDOW_MS = auth.STEP_UP_WINDOW_MINUTES * 60 * 1000;

/** Until when a step-up done at `at` lets its session close others. */
export function stepUpExpiry(at: Date): Date {
  return new Date(at.getTime() + WINDOW_MS);
}

/**
 * Guards "close another session" / "close all the others" (2026-09-25): the session making the
 * request must have stepped up (TOTP, passkey, or password when the user has neither) within
 * `STEP_UP_WINDOW_MINUTES`. Checked server-side on every call — the web's own countdown is only
 * a convenience, never the gate.
 */
export async function assertRecentStepUp(
  stepUp: SessionStepUpPort,
  userId: string,
  sessionId: string,
  now: Date = new Date(),
): Promise<void> {
  const at = await stepUp.steppedUpAt(userId, sessionId);
  if (!at || stepUpExpiry(at).getTime() <= now.getTime()) throw new StepUpRequiredError();
}
