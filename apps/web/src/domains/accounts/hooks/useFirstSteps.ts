import { useEffect, useRef, useState } from "react";

import { authApi } from "@finance/client";

import { useAuth } from "../../auth/hooks/useAuth";
import { useWallet } from "../../dashboard/hooks/useWallet";
import { useTransactionsSummary } from "../../transactions/hooks/useTransactions";
import { type FirstStepsDone, firstStepsDone, nextFirstStep } from "../lib/onboarding";
import { useAccounts } from "./useAccounts";

/**
 * Where the person is in the guided first steps (shared by the Panel and Cuentas). Whether the
 * guide is over lives on the ACCOUNT (`CurrentUser.onboardingClosed`, 2026-10-11), not the
 * browser: finishing the three steps or closing it marks it on the server, so it never shows
 * again on any device — nor after undoing a step later. `show` is false until everything it
 * depends on has loaded, so the card never flashes in and out.
 */
export function useFirstSteps(): {
  show: boolean;
  done: FirstStepsDone;
  hide: () => void;
} {
  const { user, refreshUser } = useAuth();
  const closed = user?.onboardingClosed ?? true;
  // Only asked while the guide can still show: an account that closed it never pays for these.
  const accounts = useAccounts();
  const movements = useTransactionsSummary(undefined, { enabled: !closed });
  const wallet = useWallet();
  // Hidden right away on "Ocultar guía", before the server's answer comes back.
  const [closedHere, setClosedHere] = useState(false);
  const closing = useRef(false);

  const done = firstStepsDone({
    accounts: accounts.data ?? [],
    movementCount: movements.data?.total ?? 0,
    walletCount: wallet.data?.length ?? 0,
  });
  const loaded = accounts.isSuccess && movements.isSuccess && wallet.isSuccess;
  const finished = loaded && nextFirstStep(done) === null;

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    void authApi
      .closeOnboarding()
      .then(() => refreshUser())
      .catch(() => {
        // Not saved (offline, server down): it will be asked again next time.
        closing.current = false;
      });
  };

  // All three done: the guide is over for good — mark it on the account.
  useEffect(() => {
    if (!closed && finished) close();
    // `close` is stable enough: guarded by `closing`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closed, finished]);

  return {
    show: !closed && !closedHere && loaded && !finished,
    done,
    hide: () => {
      setClosedHere(true);
      close();
    },
  };
}
