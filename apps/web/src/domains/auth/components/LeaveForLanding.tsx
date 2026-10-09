import { useEffect } from "react";

import { replaceLocation } from "../../../shared/lib/leaveApp";
import { AppSplash } from "@finance/ui/src/shared/ui/app-splash";

/** Leaves the app for a page of the public site (spec 031), replacing the current history entry so
 * Back doesn't bounce straight back here. The splash covers the moment before the browser goes. */
export function LeaveForLanding({ url }: Readonly<{ url: string }>) {
  useEffect(() => {
    replaceLocation(url);
  }, [url]);
  return <AppSplash />;
}
