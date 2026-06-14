"use client";

import { ThemeProvider } from "@/components/providers/theme-provider";
import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import type { ReactNode } from "react";

export function Providers({
  children,
  session,
}: {
  children: ReactNode;
  session: Session | null;
}) {
  return (
    <ThemeProvider>
      <SessionProvider
        session={session}
        refetchOnWindowFocus={false}
        refetchInterval={0}
      >
        {children}
      </SessionProvider>
    </ThemeProvider>
  );
}
