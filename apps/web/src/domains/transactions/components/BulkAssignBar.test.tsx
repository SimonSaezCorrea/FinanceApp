import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { customFields } from "@finance/contracts";

import i18n from "../../../i18n";
import { customFieldsApi } from "../../custom-fields/api/customFieldsApi";
import { BulkAssignBar } from "./BulkAssignBar";

vi.mock("../../custom-fields/api/customFieldsApi", () => ({
  customFieldsApi: { assign: vi.fn(), previewAssignment: vi.fn(), revert: vi.fn() },
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

const api = vi.mocked(customFieldsApi);
const FIELD = "019a0000-0000-7000-8000-0000000000f1";
const OTHER_TX = "019a0000-0000-7000-8000-0000000000a9";
const field: customFields.CustomField = {
  id: FIELD,
  name: "Transferido",
  type: "BOOLEAN",
  options: [],
  scope: { movementKinds: [], accountIds: [], cardKinds: [] },
  scopeBroken: false,
  defaultValue: null,
  showAsColumn: false,
  sortOrder: 0,
  valueCount: 0,
};

function renderBar(props: Partial<React.ComponentProps<typeof BulkAssignBar>> = {}) {
  const client = new QueryClient();
  const onDone = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <BulkAssignBar
          fields={[field]}
          fieldId={FIELD}
          onFieldChange={vi.fn()}
          selectedIds={["t1", "t2"]}
          allFiltered={false}
          target={{ ids: ["t1", "t2"] }}
          count={2}
          filteredTotal={2}
          onSelectAllFiltered={vi.fn()}
          onDone={onDone}
          onCancel={vi.fn()}
          {...props}
        />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  return { onDone };
}

const pickYes = () =>
  fireEvent.change(screen.getByLabelText(i18n.t("customFields.bulk.value")), {
    target: { value: "true" },
  });

describe("BulkAssignBar (specs/036, US4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    void i18n.changeLanguage("es");
  });

  it("assigns a few movements directly and offers to undo", async () => {
    api.assign.mockResolvedValue({
      changed: 2,
      skipped: 0,
      previous: [
        { transactionId: "t1", value: false },
        { transactionId: "t2", value: null },
      ],
    });
    api.revert.mockResolvedValue({ restored: 2, kept: 0 });
    const { onDone } = renderBar();
    pickYes();
    fireEvent.click(screen.getByRole("button", { name: i18n.t("customFields.bulk.apply") }));
    await waitFor(() => expect(api.assign).toHaveBeenCalled());
    expect(api.assign.mock.calls[0]![1]).toEqual({ target: { ids: ["t1", "t2"] }, value: true });
    expect(api.previewAssignment).not.toHaveBeenCalled();
    await waitFor(() => expect(onDone).toHaveBeenCalled());

    const [, options] = vi.mocked(toast.success).mock.calls[0]!;
    (options as unknown as { action: { onClick: () => void } }).action.onClick();
    await waitFor(() =>
      expect(api.revert).toHaveBeenCalledWith(FIELD, {
        appliedValue: true,
        restore: [
          { transactionId: "t1", value: false },
          { transactionId: "t2", value: null },
        ],
      }),
    );
  });

  it("asks first above 20 movements, saying how many hold another value", async () => {
    api.previewAssignment.mockResolvedValue({ inScope: 300, outOfScope: 4, withOtherValue: 30 });
    api.assign.mockResolvedValue({ changed: 300, skipped: 4, previous: [] });
    // Every movement of the filter, less one unticked afterwards.
    const target = { filter: { cf: FIELD, cfv: "false" }, exceptIds: [OTHER_TX] };
    renderBar({ allFiltered: true, target, count: 303, filteredTotal: 304 });
    expect(
      screen.getByText(i18n.t("customFields.bulk.allFilteredExcept", { count: 303, total: 304 })),
    ).toBeTruthy();
    pickYes();
    fireEvent.click(screen.getByRole("button", { name: i18n.t("customFields.bulk.apply") }));
    expect(
      await screen.findByText(i18n.t("customFields.bulk.confirmTitle", { count: 300 })),
    ).toBeTruthy();
    expect(api.previewAssignment.mock.calls[0]![1]).toEqual({
      target,
      value: true,
    });
    expect(api.assign).not.toHaveBeenCalled();
    const confirm = screen.getAllByRole("button", { name: i18n.t("customFields.bulk.apply") });
    fireEvent.click(confirm[confirm.length - 1]!);
    await waitFor(() => expect(api.assign).toHaveBeenCalled());
  });
});
