import { cn } from "../lib/cn";

export interface TabItem<T extends string> {
  value: T;
  label: string;
}

interface TabsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  items: TabItem<T>[];
  className?: string;
}

/** Underline-style tab bar. Content is rendered by the caller. */
export function Tabs<T extends string>({ value, onChange, items, className }: TabsProps<T>) {
  return (
    <div role="tablist" className={cn("flex gap-4 border-b", className)}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={value === item.value}
          onClick={() => onChange(item.value)}
          className={cn(
            "-mb-px border-b-2 px-1 py-2 text-sm font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === item.value
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
