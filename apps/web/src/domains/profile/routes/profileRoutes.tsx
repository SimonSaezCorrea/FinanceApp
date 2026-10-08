import { Navigate, type RouteObject } from "react-router";

import { PersonalRoute } from "./PersonalRoute";
import { PreferencesRoute } from "./PreferencesRoute";
import { PrivacyRoute } from "./PrivacyRoute";
import { SecurityRoute } from "./SecurityRoute";
import { SummaryRoute } from "./SummaryRoute";

/** The sections under `/profile` (specs/029, contracts/profile-routes.md). Shared by the app
 * router and the profile's route tests so both exercise the same tree. Each `handle.title` is the
 * i18n key `DocumentTitle` turns into the tab title. */
export const PROFILE_CHILD_ROUTES: RouteObject[] = [
  { index: true, element: <SummaryRoute />, handle: { title: "profile.sections.summary.title" } },
  {
    path: "personal",
    element: <PersonalRoute />,
    handle: { title: "profile.sections.personal.title" },
  },
  {
    path: "security",
    element: <SecurityRoute />,
    handle: { title: "profile.sections.security.title" },
  },
  {
    path: "preferences",
    element: <PreferencesRoute />,
    handle: { title: "profile.sections.preferences.title" },
  },
  {
    path: "privacy",
    element: <PrivacyRoute />,
    handle: { title: "profile.sections.privacy.title" },
  },
  // An address that names no section (old link, typo) goes back to the profile's start.
  { path: "*", element: <Navigate to="/profile" replace /> },
];
