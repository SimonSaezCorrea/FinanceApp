import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeftRight,
  Check,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import type { accounts, wallet } from "@finance/contracts";

import { cn } from "../../../shared/lib/cn";
import { Button } from "../../../shared/ui/button";
import { AccountVisualCard } from "../../accounts/components/AccountVisualCard";
import { useWallet, useWalletMutations } from "../hooks/useWallet";
import { WalletAddModal } from "./WalletAddModal";

const GRID = "grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3";

interface Resolved {
  item: wallet.WalletItem;
  account: accounts.BankAccount;
  card?: accounts.Card;
}

/** Resolve a wallet item (card or account pin) against the loaded accounts. */
function resolve(item: wallet.WalletItem, list: accounts.BankAccount[]): Resolved | null {
  if (item.cardId) {
    const account = list.find((a) => a.cards.some((c) => c.id === item.cardId));
    const card = account?.cards.find((c) => c.id === item.cardId);
    return account && card ? { item, account, card } : null;
  }
  if (item.accountId) {
    const account = list.find((a) => a.id === item.accountId);
    return account ? { item, account } : null;
  }
  return null;
}

/** "Your wallet" — user-curated. Reorder/remove live behind an "Organize" mode (drag + arrows). */
export function WalletCards({
  accountList,
  holder,
}: {
  accountList: accounts.BankAccount[];
  holder?: string;
}) {
  const { t } = useTranslation();
  const { data: walletItems } = useWallet();
  const { reorder, remove } = useWalletMutations();
  const [addOpen, setAddOpen] = useState(false);
  const [organizing, setOrganizing] = useState(false);

  const items = walletItems ?? [];
  const resolved = items
    .map((i) => resolve(i, accountList))
    .filter((r): r is Resolved => r !== null);

  function onRemove(id: string) {
    remove.mutate(id, { onSuccess: () => toast.success(t("wallet.removed")) });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{t("dashboard.wallet")}</span>
        {resolved.length > 0 ? (
          <Button variant="ghost" size="sm" onClick={() => setOrganizing((v) => !v)}>
            {organizing ? (
              <>
                <Check className="h-4 w-4" aria-hidden />
                {t("wallet.done")}
              </>
            ) : (
              <>
                <ArrowLeftRight className="h-4 w-4" aria-hidden />
                {t("wallet.organize")}
              </>
            )}
          </Button>
        ) : null}
      </div>

      <WalletAddModal open={addOpen} onOpenChange={setAddOpen} pinned={items} />

      {organizing ? (
        <WalletOrganizer
          resolved={resolved}
          holder={holder}
          onReorder={(ids) => reorder.mutate(ids)}
          onRemove={onRemove}
        />
      ) : (
        <div className={GRID}>
          {resolved.map((r) => (
            <Link key={r.item.id} to={`/accounts/${r.account.id}`} className="block">
              <AccountVisualCard account={r.account} card={r.card} holder={holder} />
            </Link>
          ))}
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="flex aspect-[16/10] min-h-[120px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <Plus className="h-6 w-6" aria-hidden />
            <span className="text-sm font-medium">{t("wallet.add")}</span>
          </button>
        </div>
      )}
    </div>
  );
}

/** Sortable grid (drag + arrows). Isolated so @dnd-kit hooks only run in organize mode. */
function WalletOrganizer({
  resolved,
  holder,
  onReorder,
  onRemove,
}: {
  resolved: Resolved[];
  holder?: string;
  onReorder: (ids: string[]) => void;
  onRemove: (id: string) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = resolved.map((r) => r.item.id);

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    onReorder(arrayMove(ids, index, target));
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from >= 0 && to >= 0) onReorder(arrayMove(ids, from, to));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div className={GRID}>
          {resolved.map((r, i) => (
            <SortableCard
              key={r.item.id}
              resolved={r}
              index={i}
              count={resolved.length}
              holder={holder}
              onMove={move}
              onRemove={onRemove}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableCard({
  resolved,
  index,
  count,
  holder,
  onMove,
  onRemove,
}: {
  resolved: Resolved;
  index: number;
  count: number;
  holder?: string;
  onMove: (index: number, delta: number) => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: resolved.item.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className={cn("relative", isDragging && "z-10 opacity-60")}>
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none rounded-2xl ring-2 ring-primary/50 active:cursor-grabbing"
      >
        <AccountVisualCard account={resolved.account} card={resolved.card} holder={holder} />
        <span className="absolute left-2 top-2 rounded-md bg-black/40 p-1 text-white">
          <GripVertical className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <div className="absolute inset-x-0 bottom-2 flex items-center justify-center gap-1">
        <IconBtn
          label={t("wallet.moveLeft")}
          disabled={index === 0}
          onClick={() => onMove(index, -1)}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </IconBtn>
        <IconBtn label={t("wallet.remove")} onClick={() => onRemove(resolved.item.id)}>
          <Trash2 className="h-4 w-4" aria-hidden />
        </IconBtn>
        <IconBtn
          label={t("wallet.moveRight")}
          disabled={index === count - 1}
          onClick={() => onMove(index, 1)}
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </IconBtn>
      </div>
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70 disabled:opacity-30"
    >
      {children}
    </button>
  );
}
