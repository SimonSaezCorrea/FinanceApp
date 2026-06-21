import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { Toaster } from "sonner";

import { AuthProvider } from "../domains/auth/hooks/useAuth";
import { ThemeProvider } from "../theme/ThemeProvider";
import i18n from "../i18n";

const queryClient = new QueryClient();

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
