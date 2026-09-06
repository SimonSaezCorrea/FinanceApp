import { Pause } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "../../../shared/ui/button";
import { DateField } from "../../../shared/ui/date-field";
import { DetailRow } from "../../../shared/ui/detail-row";
import { Modal } from "../../../shared/ui/overlay";

interface Props {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly name: string;
  /** `false` = pausing (currently active), `true` = reactivating (currently paused). */
  readonly resume: boolean;
  readonly date: string;
  readonly onDateChange: (date: string) => void;
  readonly onConfirm: () => void;
  readonly submitting?: boolean;
}

/**
 * Pause/reactivate always go through this modal, never a direct click on the
 * row's icon-button — per the handoff, the effective date matters even though
 * `RecurringExpense` has no column to store it: the real model only has
 * `active` (boolean), so what's actually persisted is that flag, and this
 * date is shown back afterwards as `updatedAt` on the series (see
 * `RecurringRow`/`RecurringDetailPanel`'s "pausado desde"). Picking a date
 * other than today does not change server timestamps — see the route's own
 * note on this gap.
 */
export function RecurringPauseModal({
  open,
  onOpenChange,
  name,
  resume,
  date,
  onDateChange,
  onConfirm,
  submitting,
}: Props) {
  const { t } = useTranslation();

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      className="max-w-[440px]"
      title={
        <span className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
            <Pause className="h-4 w-4" aria-hidden />
          </span>
          {t(resume ? "recurring.pause.titleResume" : "recurring.pause.titlePause", { name })}
        </span>
      }
      description={t(resume ? "recurring.pause.bodyResume" : "recurring.pause.bodyPause")}
    >
      <div className="flex flex-col gap-2">
        <DetailRow
          className="border-b-0 border-t border-border pt-3"
          label={t(resume ? "recurring.pause.resumeFrom" : "recurring.pause.pauseFrom")}
        >
          <DateField
            variant="inline"
            value={date}
            onChange={onDateChange}
            aria-label={t(resume ? "recurring.pause.resumeFrom" : "recurring.pause.pauseFrom")}
          />
        </DetailRow>
        <p className="text-xs text-muted-foreground">
          {t(resume ? "recurring.pause.hintResume" : "recurring.pause.hintPause")}
        </p>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t("common.cancel")}
          </Button>
          <Button
            variant={resume ? "accent" : "outline"}
            onClick={onConfirm}
            disabled={submitting}
            className={resume ? undefined : "text-warning hover:bg-warning/10 hover:text-warning"}
          >
            {t(resume ? "recurring.actions.resume" : "recurring.actions.pause")}
          </Button>
        </div>
      </div>
    </Modal>
    // `name` is used only inside the accessible title above.
  );
}
