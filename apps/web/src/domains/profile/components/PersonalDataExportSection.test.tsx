import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Providers } from "../../../app/providers";
import i18n from "../../../i18n";
import { PersonalDataExportSection } from "./PersonalDataExportSection";

const saveFile = vi.fn();
vi.mock("../../../shared/lib/saveFile", () => ({
  saveFile: (...args: unknown[]) => saveFile(...args),
}));

const buildTemplate = vi.fn();
vi.mock("../../import/lib/buildTemplate", () => ({
  buildTemplate: (...args: unknown[]) => buildTemplate(...args),
}));

vi.mock("../../reference/hooks/useReference", () => ({
  useCategories: () => ({ data: [] }),
  useInstitutions: () => ({ data: [] }),
}));
vi.mock("../../reference/hooks/useAllowedCurrencies", () => ({
  useAllowedCurrencies: () => [],
}));

const loadPersonalData = vi.fn();
vi.mock("../lib/personalData", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/personalData")>()),
  loadPersonalData: (...args: unknown[]) => loadPersonalData(...args),
}));

const DATA = {
  user: { id: "u1", name: "Ana", extraCurrencies: [] },
  emails: [],
  consents: [],
  sessions: [],
  passkeys: [],
  wallet: [],
  financial: {
    accounts: [],
    transactions: [],
    debts: [],
    plans: [],
    recurring: [],
    goals: [],
    entries: [],
    statements: [],
    categories: [],
  },
};

/** jsdom's Blob has no `text()`. */
function readText(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
}

function renderSection() {
  return render(
    <Providers>
      <PersonalDataExportSection />
    </Providers>,
  );
}

describe("PersonalDataExportSection — Descargar mis datos", () => {
  beforeEach(() => {
    saveFile.mockReset();
    buildTemplate.mockReset();
    loadPersonalData.mockReset().mockResolvedValue(DATA);
  });

  it("downloads Excel by default: the pre-filled template plus the profile sheets", async () => {
    buildTemplate.mockResolvedValue(new Blob(["xlsx"]));
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: i18n.t("profile.export.download") }));

    await waitFor(() => expect(saveFile).toHaveBeenCalledTimes(1));
    const [, name] = saveFile.mock.calls[0]!;
    expect(name).toMatch(
      new RegExp(`^${i18n.t("profile.export.fileName")}-\\d{4}-\\d{2}-\\d{2}\\.xlsx$`),
    );
    const input = buildTemplate.mock.calls[0]![0] as { existing: unknown; extraSheets: unknown };
    expect(input.existing).toBeDefined();
    expect(typeof input.extraSheets).toBe("function");
  });

  it("downloads JSON when picked, without building a spreadsheet", async () => {
    renderSection();

    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("profile.export.formats.json.label") }),
    );
    // The hint italicises the brand, so it is matched by the paragraph's whole text.
    const hint = i18n.t("profile.export.formats.json.hint");
    expect(
      screen.getByText((_, el) => el?.tagName === "P" && el.textContent === hint),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: i18n.t("profile.export.download") }));

    await waitFor(() => expect(saveFile).toHaveBeenCalledTimes(1));
    const [blob, name] = saveFile.mock.calls[0] as [Blob, string];
    expect(name).toMatch(/\.json$/);
    expect(blob.type).toBe("application/json");
    expect(JSON.parse(await readText(blob)).format).toBe("fik-personal-data");
    expect(buildTemplate).not.toHaveBeenCalled();
  });

  it("says so when the file can't be prepared", async () => {
    loadPersonalData.mockRejectedValue(new Error("offline"));
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: i18n.t("profile.export.download") }));

    expect(await screen.findByText(i18n.t("profile.export.error"))).toBeTruthy();
    expect(saveFile).not.toHaveBeenCalled();
  });
});
