/** "Copiar" (the AI page, and "Copiar página para LLMs" on a guide): copies `[data-llms-text]` and
 * says so in the button for two seconds (the labels come from the page, in its language). The
 * source is either shown text (a `<pre>`) or a JSON string island (`<script type="application/json">`)
 * when the text isn't on the page as such (a guide's Markdown). */
export function initLlmsCopy(root: ParentNode = document): void {
  const button = root.querySelector<HTMLButtonElement>("[data-llms-copy]");
  const source = root.querySelector<HTMLElement>("[data-llms-text]");
  const label = button?.querySelector<HTMLElement>("[data-llms-copy-label]");
  if (!button || !source || !label) return;
  const idle = label.textContent ?? "";
  let timer: ReturnType<typeof setTimeout> | undefined;

  button.hidden = false;
  button.addEventListener("click", async () => {
    let done = false;
    try {
      const raw = source.textContent ?? "";
      await navigator.clipboard.writeText(
        source instanceof HTMLScriptElement ? (JSON.parse(raw) as string) : raw,
      );
      done = true;
    } catch {
      done = false;
    }
    label.textContent = (done ? button.dataset.copied : button.dataset.failed) ?? idle;
    clearTimeout(timer);
    timer = setTimeout(() => {
      label.textContent = idle;
    }, 2000);
  });
}
