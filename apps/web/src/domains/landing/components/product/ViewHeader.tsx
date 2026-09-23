/** Heading of one product view (the page's own `h1` is "El producto"). */
export function ViewHeader({
  title,
  description,
}: Readonly<{ title: string; description: string }>) {
  return (
    <div className="min-w-0">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
