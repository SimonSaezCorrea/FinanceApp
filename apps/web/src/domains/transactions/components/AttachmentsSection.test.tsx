import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "../../../i18n";
import { ApiRequestError } from "../../../shared/lib/apiClient";
import { transactionsApi } from "../api/transactionsApi";
import { AttachmentsSection } from "./AttachmentsSection";

vi.mock("../api/transactionsApi", () => ({
  transactionsApi: {
    attachments: { list: vi.fn(), upload: vi.fn(), url: vi.fn(), remove: vi.fn() },
  },
}));

const attachment = {
  id: "at1",
  transactionId: "t1",
  fileName: "boleta.pdf",
  contentType: "application/pdf" as const,
  sizeBytes: 2048,
  createdAt: "2026-08-01T00:00:00.000Z",
};

/** Uploading is switched off by default until a bucket exists, so the tests that
 *  exercise the flow turn it on explicitly. */
function renderSection(props: Parameters<typeof AttachmentsSection>[0] = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <AttachmentsSection uploadEnabled {...props} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

const fileOf = (name: string, type: string, size: number) => {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
};

const pick = (file: File) => {
  const input = screen.getByLabelText(i18n.t("transactions.attachments.browse"));
  fireEvent.change(input, { target: { files: [file] } });
};

describe("AttachmentsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(transactionsApi.attachments.list).mockResolvedValue([attachment]);
  });

  it("offers the picker as 'coming soon', disabled, while uploading is off", async () => {
    renderSection({ transactionId: "t1", uploadEnabled: false });

    const button = screen.getByRole("button", {
      name: i18n.t("transactions.attachments.comingSoon"),
    });
    expect(button.hasAttribute("disabled")).toBe(true);
    // The file input isn't even rendered — nothing to trigger.
    expect(screen.queryByLabelText(i18n.t("transactions.attachments.browse"))).toBeNull();
    // Existing receipts stay readable.
    expect(await screen.findByText("boleta.pdf")).toBeDefined();
  });

  it("lists the movement's receipts", async () => {
    renderSection({ transactionId: "t1" });
    expect(await screen.findByText("boleta.pdf")).toBeDefined();
    expect(screen.getByText("2 KB")).toBeDefined();
  });

  it("rejects an oversized file locally, before sending anything", async () => {
    renderSection({ transactionId: "t1" });
    pick(fileOf("huge.pdf", "application/pdf", 6 * 1024 * 1024));

    expect(await screen.findByText(i18n.t("errors.ATTACHMENT_TOO_LARGE"))).toBeDefined();
    expect(transactionsApi.attachments.upload).not.toHaveBeenCalled();
  });

  it("rejects an unsupported type locally", async () => {
    renderSection({ transactionId: "t1" });
    pick(fileOf("x.zip", "application/zip", 1024));

    expect(await screen.findByText(i18n.t("errors.ATTACHMENT_TYPE_NOT_ALLOWED"))).toBeDefined();
    expect(transactionsApi.attachments.upload).not.toHaveBeenCalled();
  });

  it("surfaces ATTACHMENTS_UNAVAILABLE from the server", async () => {
    vi.mocked(transactionsApi.attachments.upload).mockRejectedValue(
      new ApiRequestError("ATTACHMENTS_UNAVAILABLE", 503),
    );
    renderSection({ transactionId: "t1" });
    pick(fileOf("boleta.pdf", "application/pdf", 1024));

    expect(await screen.findByText(i18n.t("transactions.attachments.failed"))).toBeDefined();
    // The chosen file is never dropped silently — Retry stays available.
    expect(screen.getByText(i18n.t("transactions.attachments.retry"))).toBeDefined();
  });

  it("holds files until the movement exists, then uploads them", async () => {
    vi.mocked(transactionsApi.attachments.upload).mockResolvedValue(attachment);
    const { rerender } = renderSection();
    expect(screen.getByText(i18n.t("transactions.attachments.saveFirst"))).toBeDefined();

    pick(fileOf("boleta.pdf", "application/pdf", 1024));
    expect(transactionsApi.attachments.upload).not.toHaveBeenCalled();

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={client}>
        <I18nextProvider i18n={i18n}>
          <AttachmentsSection transactionId="t1" />
        </I18nextProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(transactionsApi.attachments.upload).toHaveBeenCalledOnce());
  });
});
