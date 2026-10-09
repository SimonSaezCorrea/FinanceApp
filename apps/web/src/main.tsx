import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";

import { configureClient } from "@finance/client";

import "@fontsource-variable/geist";
import "@fontsource-variable/inter";

import { preloadPage } from "./app/lazyPages";
import { Providers } from "./app/providers";
import { primeSession } from "./domains/auth/hooks/useAuth";
import { router } from "./app/router";
import { trackScrollbarGap } from "./shared/lib/scrollbarGap";
import "./styles/index.css";

configureClient({ baseUrl: import.meta.env.VITE_API_URL });
primeSession();
preloadPage(window.location.pathname);
trackScrollbarGap();

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

createRoot(rootEl).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
);
