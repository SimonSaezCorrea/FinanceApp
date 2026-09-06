import { DetailRow } from "../detail-row";
import { Switch } from "../switch";

interface Props {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

/** Label/value row for an on/off preference — the same `DetailRow` + `Switch`
 * pair a movement's "Cargo financiero" (and similar boolean fields) already
 * built by hand. Reach for `FormChip` instead when the two states are named
 * options rather than a plain on/off (Debes/Te deben, Activo/Pausado). */
export function FormSwitchField({ label, checked, onChange, disabled, className }: Readonly<Props>) {
  return (
    <DetailRow label={label} className={className}>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label} />
    </DetailRow>
  );
}
