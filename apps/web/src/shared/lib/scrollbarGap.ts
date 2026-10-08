/**
 * Publishes the browser's scrollbar width as `--scrollbar-gap` on `<html>`.
 *
 * The landing pages reserve the page scrollbar's space (`scrollbar-gutter: stable`)
 * so navigation never shifts the layout. While an overlay locks scroll, that gutter
 * is released (otherwise fixed scrims and side panels leave an uncovered strip at the
 * right edge) and `<body>` takes a right margin of exactly this width instead, so
 * nothing behind the overlay moves (`styles/index.css`). The signed-in app has no
 * page gutter at all, so it never uses this.
 *
 * Measured on a throwaway scrolling box rather than from the page (Radix measures
 * `innerWidth - clientWidth` at lock time, which depends on what the page happens to
 * be doing then): the result is the scrollbar's width whatever page is showing, and
 * 0 with overlay scrollbars (phones, macOS default).
 */
export function trackScrollbarGap(): void {
  const measure = () => {
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:absolute;top:-9999px;width:100px;height:100px;overflow:scroll;visibility:hidden";
    document.body.appendChild(probe);
    const gap = Math.max(0, probe.offsetWidth - probe.clientWidth);
    probe.remove();
    document.documentElement.style.setProperty("--scrollbar-gap", `${gap}px`);
  };
  measure();
  // Zooming changes the scrollbar's width in CSS pixels.
  window.addEventListener("resize", measure);
}
