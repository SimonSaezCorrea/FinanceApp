/**
 * A toast sits outside every dialog's DOM, so Radix reads a click on it (its
 * "×") as a click outside and closes the dialog — or, with focus trapped,
 * swallows it. Passed as a dialog's `onInteractOutside`, this lets the toast be
 * used while the dialog stays open.
 */
export function keepOpenOnToast(event: { target: EventTarget | null; preventDefault(): void }) {
  const target = event.target;
  if (target instanceof Element && target.closest("[data-sonner-toaster]")) {
    event.preventDefault();
  }
}
