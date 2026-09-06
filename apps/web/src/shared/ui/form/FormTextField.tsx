import { DetailRow } from "../detail-row";

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Shown under the row, e.g. a last-4-digits or expiry validation message —
   * the row format has no room for it inline, so it drops below the divider. */
  error?: string | null;
  className?: string;
}

/** Label/value row for a single line of free text — reads as plain text until
 * focused, the same borderless right-aligned field every form's optional
 * detail rows (Nota, Emisor, Receptor…) already build by hand. */
export function FormTextField({
  label,
  value,
  onChange,
  id,
  placeholder,
  disabled,
  error,
  className,
}: Readonly<Props>) {
  return (
    <>
      <DetailRow label={label} className={className}>
        <input
          id={id}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={label}
          className="h-8 w-full max-w-[13rem] border-0 bg-transparent p-0 text-right text-sm font-medium text-foreground placeholder:text-muted-foreground shadow-none focus-visible:outline-none focus-visible:ring-0"
        />
      </DetailRow>
      {error ? (
        <p role="alert" className="-mt-2 pb-2 text-right text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </>
  );
}
