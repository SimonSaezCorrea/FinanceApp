import { afterEach, describe, expect, it, vi } from "vitest";

import { initLlmsCopy } from "./copy";

function mount() {
  document.body.innerHTML = `
    <button data-llms-copy data-copied="Copiado" data-failed="No se pudo copiar" hidden>
      <span data-llms-copy-label>Copiar</span>
    </button>
    <pre data-llms-text># fik</pre>`;
  initLlmsCopy();
  return document.querySelector<HTMLButtonElement>("[data-llms-copy]")!;
}

describe("initLlmsCopy", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows the button and copies the summary", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const button = mount();
    expect(button.hidden).toBe(false);
    button.click();
    await vi.waitFor(() => expect(button.textContent).toContain("Copiado"));
    expect(writeText).toHaveBeenCalledWith("# fik");
  });

  it("copies a JSON string island as its text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    document.body.innerHTML = `
      <button data-llms-copy data-copied="Copiado" hidden><span data-llms-copy-label>Copiar</span></button>
      <script type="application/json" data-llms-text>"# Guía\\n\\nTexto"</script>`;
    initLlmsCopy();
    document.querySelector<HTMLButtonElement>("[data-llms-copy]")!.click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith("# Guía\n\nTexto"));
  });

  it("says so when the clipboard refuses", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("no")) },
    });
    const button = mount();
    button.click();
    await vi.waitFor(() => expect(button.textContent).toContain("No se pudo copiar"));
  });
});
