import type { ButtonHTMLAttributes } from "react";

import { type ButtonSize, type ButtonVariant, buttonClasses } from "./button-classes";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/**
 * `type="button"` by default, NOT the HTML default of `"submit"`: every form in
 * this app labels its submit explicitly, and an implicit submit caused a real bug
 * — React 19 flushes a click's state update synchronously, so a button that turned
 * INTO the submit button during its own click (a "Editar" that became "Guardar"
 * when the surface swapped to edit mode, reusing the same DOM node) had the
 * browser run the default action against the freshly patched attributes and saved
 * immediately.
 */
export function Button({
  className,
  variant = "primary",
  size = "md",
  type = "button",
  ...props
}: ButtonProps) {
  return <button type={type} className={buttonClasses({ variant, size, className })} {...props} />;
}
