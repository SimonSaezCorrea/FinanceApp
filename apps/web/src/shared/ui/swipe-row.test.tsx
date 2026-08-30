import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import i18n from "../../i18n";
import { SwipeRow } from "./swipe-row";

const ACTION_WIDTH = 144;

function renderRow(props: Partial<Parameters<typeof SwipeRow>[0]> = {}) {
  const onOpenChange = vi.fn();
  const onTap = vi.fn();
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  const utils = render(
    <I18nextProvider i18n={i18n}>
      <SwipeRow
        open={false}
        onOpenChange={onOpenChange}
        onEdit={onEdit}
        onDelete={onDelete}
        onTap={onTap}
        {...props}
      >
        <span>Unimarc</span>
      </SwipeRow>
    </I18nextProvider>,
  );
  // The sliding layer is the content's own wrapper (the element carrying the
  // inline transform), not the clipping root.
  const content = screen.getByText("Unimarc").parentElement as HTMLElement;
  const root = content.parentElement as HTMLElement;
  return { ...utils, root, content, onOpenChange, onTap, onEdit, onDelete };
}

/**
 * Dispatches the pointer sequence as `MouseEvent`s: jsdom's PointerEvent (when
 * it has one at all) drops `clientX`, which would silently make every drag read
 * as a zero-distance tap. MouseEvent carries the coordinates the handler
 * actually does math on.
 *
 * The press goes to the row (a React handler); move/release go to `document`,
 * which is where the component binds them for the duration of a gesture.
 */
function pointer(
  target: HTMLElement | Document,
  type: string,
  clientX: number,
  clientY: number = 0,
) {
  fireEvent(target, new MouseEvent(type, { clientX, clientY, bubbles: true }));
}

function drag(root: HTMLElement, from: number, to: number) {
  pointer(root, "pointerdown", from);
  pointer(document, "pointermove", to);
  pointer(document, "pointerup", to);
}

/** Lets the `setTimeout(…, 0)` that reports the settled state run. */
function flushTimers() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("SwipeRow", () => {
  it("settles back to closed after an incomplete drag instead of hanging where the finger let go", () => {
    const { root, content, onOpenChange } = renderRow();

    // Past the 8px axis lock, but short of the 50% (72px) open threshold.
    drag(root, 200, 160);

    expect(content.style.transform).toBe("translateX(0px)");
    // Already closed and settling back to closed — no state change to report.
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("settles fully open once the drag passes the halfway threshold", async () => {
    const { root, content, onOpenChange } = renderRow();

    drag(root, 200, 100);

    // The slide is applied synchronously on release…
    expect(content.style.transform).toBe(`translateX(-${ACTION_WIDTH}px)`);
    // …while reporting the new state is deferred a task, so the browser can
    // paint the transition's first frame before the list re-renders.
    expect(onOpenChange).not.toHaveBeenCalled();
    await flushTimers();
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it("treats a press with no horizontal travel as a tap", () => {
    const { root, onTap, onOpenChange } = renderRow();

    drag(root, 200, 203);

    expect(onTap).toHaveBeenCalledOnce();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("a tap on an already-open row closes it rather than opening the detail sheet", () => {
    const { root, onTap, onOpenChange } = renderRow({ open: true });

    drag(root, 200, 202);

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onTap).not.toHaveBeenCalled();
  });

  it("does not treat a vertical scroll as a tap (would open the detail sheet)", () => {
    const { root, onTap, onOpenChange } = renderRow();

    // Finger goes down and travels vertically — a list scroll, not a swipe.
    pointer(root, "pointerdown", 200, 400);
    pointer(document, "pointermove", 202, 340);
    pointer(document, "pointerup", 202, 340);

    expect(onTap).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("does not treat a browser-cancelled gesture as a tap", () => {
    const { root, onTap } = renderRow();

    // `pointercancel` is what the browser sends when it takes the gesture over.
    pointer(root, "pointerdown", 200, 400);
    pointer(document, "pointermove", 201, 402);
    fireEvent(document, new MouseEvent("pointercancel", { bubbles: true }));

    expect(onTap).not.toHaveBeenCalled();
  });

  it("fires an action on the FIRST press after swiping the row open", () => {
    // The reported bug: Editar/Eliminar needed a second press. A "was this
    // click part of the drag?" guard had nothing to catch (the drag's trailing
    // click lands on the row content, which has no click handler) and instead
    // swallowed the user's real first click.
    const { root, onDelete, onEdit } = renderRow();

    drag(root, 200, 100);

    const deleteButton = screen.getByRole("button", { name: i18n.t("common.delete") });
    pointer(deleteButton, "pointerdown", 300);
    fireEvent.click(deleteButton);
    expect(onDelete).toHaveBeenCalledOnce();

    const editButton = screen.getByRole("button", { name: i18n.t("common.edit") });
    pointer(editButton, "pointerdown", 300);
    fireEvent.click(editButton);
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it("closes the panel when an action runs", () => {
    const { root, onOpenChange } = renderRow();
    drag(root, 200, 100);
    onOpenChange.mockClear();

    fireEvent.click(screen.getByRole("button", { name: i18n.t("common.edit") }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("a press on a nested control marked as its own action never becomes a row tap", () => {
    // How the tablet row's "..." menu opts out: without this, opening the menu
    // would also register as a tap and open the detail sheet behind it.
    const onTap = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <SwipeRow open={false} onOpenChange={vi.fn()} onEdit={vi.fn()} onTap={onTap}>
          <span data-swipe-action>
            <button type="button">menu</button>
          </span>
        </SwipeRow>
      </I18nextProvider>,
    );

    const menu = screen.getByRole("button", { name: "menu" });
    pointer(menu, "pointerdown", 300);
    pointer(document, "pointerup", 300);

    expect(onTap).not.toHaveBeenCalled();
  });

  it("still settles when the release lands somewhere other than the row itself", () => {
    // The regression this guards: the revealed buttons slide out from under the
    // finger mid-drag, so the pointerup can be delivered to a different element.
    // Listening on `document` is what keeps the row from parking at the drop point.
    const { root, content } = renderRow();

    pointer(root, "pointerdown", 200);
    pointer(document, "pointermove", 160);
    expect(content.style.transform).toBe("translateX(-40px)");

    pointer(document.body, "pointerup", 160);
    expect(content.style.transform).toBe("translateX(0px)");
  });

  it("does not start a drag when the press begins on a revealed action button", () => {
    const { content, onEdit } = renderRow({ open: true });
    const editButton = screen.getByRole("button", { name: i18n.t("common.edit") });

    pointer(editButton, "pointerdown", 300);
    pointer(document, "pointermove", 200);

    // The row stayed put — no gesture was started from the button.
    expect(content.style.transform).toBe(`translateX(-${ACTION_WIDTH}px)`);
    fireEvent.click(editButton);
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it("animates to the resting position when the parent closes it from outside", () => {
    const { content, rerender } = renderRow({ open: true });
    expect(content.style.transform).toBe(`translateX(-${ACTION_WIDTH}px)`);

    rerender(
      <I18nextProvider i18n={i18n}>
        <SwipeRow open={false} onOpenChange={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()}>
          <span>Unimarc</span>
        </SwipeRow>
      </I18nextProvider>,
    );

    expect(content.style.transform).toBe("translateX(0px)");
  });
});
