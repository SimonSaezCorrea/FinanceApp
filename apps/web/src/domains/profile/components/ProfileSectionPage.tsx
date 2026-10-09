import type { ReactNode } from "react";

/** The frame every profile section shares (specs/029): its own `h1` (focus target when the
 * section opens) and an optional one-line description, then the section's blocks. */
export function ProfileSectionPage({
  id,
  title,
  description,
  children,
}: Readonly<{ id: string; title: string; description?: string; children: ReactNode }>) {
  const headingId = `profile-${id}-title`;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-5">
      <header className="flex flex-col gap-1.5">
        <h1
          id={headingId}
          tabIndex={-1}
          className="text-xl font-semibold tracking-tight focus:outline-none"
        >
          {title}
        </h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </header>
      {children}
    </section>
  );
}
