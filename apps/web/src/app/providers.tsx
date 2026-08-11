import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { Toaster } from "sonner";

import { AuthProvider } from "../domains/auth/hooks/useAuth";
import { ApiRequestError } from "../shared/lib/apiClient";
import { ThemeProvider } from "../theme/ThemeProvider";
import i18n from "../i18n";

/** Statuses where retrying is pointless: the answer won't change by asking again. */
const NO_RETRY_STATUS = new Set([400, 401, 403, 404, 409, 422]);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Default is 3 blind retries. On an expired session that turned ONE failed
      // query into four requests, each one attempting a token refresh — the
      // NO_REFRESH_TOKEN storm in the API log. A 401 is an answer, not a blip.
      retry: (failureCount, error) => {
        if (error instanceof ApiRequestError && NO_RETRY_STATUS.has(error.status)) return false;
        return failureCount < 2;
      },
    },
  },
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <AuthProvider>{children}</AuthProvider>
          <Toaster theme="system" richColors position="bottom-right" />
        </I18nextProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
