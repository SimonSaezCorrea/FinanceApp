import { lazy } from "react";

/** Each profile section is its own chunk, loaded when opened: the app router imports
 * `profileRoutes` eagerly, so importing the sections there directly would put them all in the
 * entry bundle. */
export const SummaryRoute = lazy(() =>
  import("./SummaryRoute").then((m) => ({ default: m.SummaryRoute })),
);
export const PersonalRoute = lazy(() =>
  import("./PersonalRoute").then((m) => ({ default: m.PersonalRoute })),
);
export const SecurityRoute = lazy(() =>
  import("./SecurityRoute").then((m) => ({ default: m.SecurityRoute })),
);
export const PreferencesRoute = lazy(() =>
  import("./PreferencesRoute").then((m) => ({ default: m.PreferencesRoute })),
);
export const PrivacyRoute = lazy(() =>
  import("./PrivacyRoute").then((m) => ({ default: m.PrivacyRoute })),
);
