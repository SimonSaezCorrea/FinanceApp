import { useMediaQuery } from "../../lib/useMediaQuery";
import { Drawer, type DrawerProps } from "./drawer";
import { SHEET_QUERY } from "./surface";
import { Window } from "./window";

/**
 * The right-side panel form of an overlay: a `Drawer` where there's room for one,
 * a full-screen `Window` on a phone. Sibling of `ResponsiveSurface`, which picks
 * a centered `Modal` instead.
 *
 * Which of the two a screen should use is a question about the CONTENT, not about
 * the width:
 * - `ResponsiveSurface` (modal) for short, self-contained interruptions — a
 *   confirmation, a two-field form, a picker. It floats over the page and the
 *   page still reads as the subject.
 * - `SidePanel` (this one) for working WITH a record: a long form, a detail view,
 *   anything where the list or page behind should stay visible as context but out
 *   of reach. The panel owns the full height, so a tall form scrolls in its own
 *   body with its actions pinned, instead of a centered card growing until it
 *   fights the viewport.
 *
 * Both share `SurfaceChrome`, so a caller describes the overlay once (eyebrow,
 * title, description, body, footer) and moving a screen between the two forms is
 * a one-word change.
 */
export function SidePanel({ className, ...props }: Readonly<DrawerProps>) {
  const roomForPanel = useMediaQuery(SHEET_QUERY);

  return roomForPanel ? <Drawer className={className} {...props} /> : <Window {...props} />;
}
