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

/**
 * Irreversible or credential-replacing actions that are confirmed with the password (change the
 * password, delete the account — security run-3): when the account has a second factor or a usable
 * passkey, the password alone is not enough — the session must also have stepped up recently, and
 * with such an account a step-up is that factor, never the password (`auth.stepUpMethodsFor`).
 * Returns the step-up to spend, or null when the account has neither (the password is then the
 * whole assurance, as a step-up would be the password again).
 */
export async function requireStepUpIfProtected(
  deps: { stepUp: SessionStepUpPort; passkeys: { countUsable(userId: string): Promise<number> } },
  user: { id: string; mfaEnabled: boolean },
  sessionId: string,
  now: Date = new Date(),
): Promise<Date | null> {
  const protectedAccount = user.mfaEnabled || (await deps.passkeys.countUsable(user.id)) > 0;
  if (!protectedAccount) return null;
  const at = await deps.stepUp.steppedUpAt(user.id, sessionId);
  if (!at || stepUpExpiry(at).getTime() <= now.getTime()) throw new StepUpRequiredError();
  return at;
}
