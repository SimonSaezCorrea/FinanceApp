import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "../button";
import { Modal } from "./modal";

interface ConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  /** Confirm button tone. Destructive by default — most confirmations here are
   * a delete or a discard, which is also the safer default to get wrong. */
  destructive?: boolean;
  loading?: boolean;
  /** Extra content between the description and the buttons (e.g. a required field). */
  children?: ReactNode;
}

/**
 * A question the user has to answer before something happens.
 *
 * Deliberately always a `Modal`, never a window: an alert is a short
 * interruption, and turning it into a full screen on a phone would both hide the
 * thing being asked about and make a two-button question look like a place you
 * navigated to. It's also the one overlay that may sit ON TOP of another surface
 * (confirming a delete from inside an edit sheet), which only works as a card.
 */
export function ConfirmModal({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmLabel,
  destructive = true,
  loading,
  children,
}: Readonly<ConfirmModalProps>) {
  const { t } = useTranslation();

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      className="max-w-sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {t("common.cancel")}
          </Button>
          <Button
            variant={destructive ? "destructive" : "primary"}
            size="sm"
            onClick={onConfirm}
            disabled={loading}
          >
            {confirmLabel ?? t("common.delete")}
          </Button>
        </div>
      }
    >
      {children}
    </Modal>
  );
}
