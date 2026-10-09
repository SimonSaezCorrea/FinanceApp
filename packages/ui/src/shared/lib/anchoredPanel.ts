/**
 * Placement for a dropdown panel that is PORTALED out of its control.
 *
 * A `fixed` child is positioned against the VIEWPORT — unless an ancestor
 * establishes a containing block (a transform, filter or will-change does it).
 * A Dialog's content has one WHILE its open animation runs and none once it
 * settles, so the coordinates have to say which frame of reference they are in
 * instead of assuming one: assuming wrong throws the panel across the screen.
 *
 * The panel targets the nearest `[role="dialog"]` ancestor rather than
 * `document.body`, so Radix's focus trap / dismissable layer / scroll lock —
 * all gated on real DOM containment — see it as part of the dialog instead of
 * an outside click.
 *
 * Extracted so the three consumers (Combobox, SearchableSelect, DateField)
 * share ONE definition of this geometry: three copies of it would drift, and
 * the failure mode is a panel landing somewhere impossible on one of them only.
 */

/** Room a dropdown wants below the control before it gives up and flips up. */
export const MIN_PANEL_HEIGHT = 200;
/** Its normal cap; a flipped panel may get less if that's all there is. */
export const MAX_PANEL_HEIGHT = 240;

export interface PanelRect {
  /** Set when the panel hangs BELOW the control; `bottom` when it flips above. */
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  /** How much room the chosen side actually has, so a flipped panel that still
   *  doesn't fit scrolls instead of running off the screen. */
  maxHeight: number;
}

export function establishesContainingBlock(el: Element): boolean {
  const style = getComputedStyle(el);
  return (
    style.transform !== "none" ||
    style.filter !== "none" ||
    style.perspective !== "none" ||
    style.willChange.includes("transform") ||
    style.contain.includes("paint")
  );
}

export interface AnchoredPanelOptions {
  /** Cap for the panel's height; defaults to `MAX_PANEL_HEIGHT`. */
  maxHeight?: number;
  /** Below this much room, the panel flips above the control. */
  minHeight?: number;
  /** Panel width when it should NOT match the control (e.g. a calendar). */
  width?: number;
  /**
   * Floor for the width when it DOES follow the control — for a control that
   * shrink-wraps its text (the `inline` combobox), whose own width says nothing
   * about how long the options are.
   */
  minWidth?: number;
  /** Right-align the panel with the control instead of left-aligning it. */
  align?: "start" | "end";
}

/** Where to place the panel for `control`, and which element to portal it into. */
export function anchoredPanelRect(
  control: Element,
  options: AnchoredPanelOptions = {},
): { rect: PanelRect; portalTarget: Element } {
  const {
    maxHeight = MAX_PANEL_HEIGHT,
    minHeight = MIN_PANEL_HEIGHT,
    width,
    minWidth,
    align = "start",
  } = options;

  const portalTarget = control.closest('[role="dialog"]') ?? document.body;
  const controlRect = control.getBoundingClientRect();
  // Only subtract the dialog's own offset when the dialog is what `fixed`
  // resolves against; otherwise these are plain viewport coordinates.
  const originRect =
    portalTarget !== document.body && establishesContainingBlock(portalTarget)
      ? portalTarget.getBoundingClientRect()
      : null;
  const origin = originRect ?? { top: 0, left: 0 };
  // When `fixed` resolves against the dialog, a bottom-anchored panel measures
  // from the dialog's bottom edge, not the window's.
  const originBottom = originRect ? globalThis.innerHeight - originRect.bottom : null;

  // Flip up when the space below can't hold a usable panel and there's more room
  // above — one that opens off the bottom of the window is unusable exactly
  // where it matters, at the last field of a long form.
  const gap = 4;
  const spaceBelow = globalThis.innerHeight - controlRect.bottom - gap;
  const spaceAbove = controlRect.top - gap;
  const flipUp = spaceBelow < minHeight && spaceAbove > spaceBelow;

  // Never wider than the window itself (a phone with a 220px floor).
  const panelWidth = Math.min(
    Math.max(width ?? controlRect.width, minWidth ?? 0),
    globalThis.innerWidth - 16,
  );
  const left =
    align === "end" ? controlRect.right - panelWidth - origin.left : controlRect.left - origin.left;

  return {
    portalTarget,
    rect: {
      ...(flipUp
        ? // Anchored by its bottom edge, so the panel doesn't need to be measured
          // before it can be placed.
          { bottom: globalThis.innerHeight - controlRect.top + gap - (originBottom ?? 0) }
        : { top: controlRect.bottom + gap - origin.top }),
      // Never off the left edge, which right-alignment can cause on a phone.
      left: Math.max(8 - origin.left, left),
      width: panelWidth,
      maxHeight: Math.min(maxHeight, flipUp ? spaceAbove : spaceBelow),
    },
  };
}
