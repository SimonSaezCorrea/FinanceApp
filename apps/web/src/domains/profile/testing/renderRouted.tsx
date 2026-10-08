import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";

/**
 * Renders a profile component inside a data router (specs/029): the sections read the URL
 * (`?edit=`, `#two-factor`) and guard unsaved edits with `useBlocker`, which only works under a
 * data router. Pass the same tree you'd give `render` (`<Providers>…</Providers>` included).
 */
export function renderRouted(ui: ReactElement, path = "/profile") {
  const router = createMemoryRouter([{ path: "*", element: ui }], { initialEntries: [path] });
  const result = render(<RouterProvider router={router} />);
  return { ...result, router };
}
