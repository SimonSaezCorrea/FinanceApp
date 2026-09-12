/** Small caps label marking a loose group of rows — a hero figure's tag
 *  ("SALDO INICIAL") or a section header when no tab strip already names it.
 *  Muted, not the brand color, so it never competes with the content below it. */
export function SectionLabel({ children }: Readonly<{ children: string }>) {
  return (
    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </span>
  );
}
