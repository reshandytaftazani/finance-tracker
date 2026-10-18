/** Keep the native dialog and its focus trap alive until the exit completes. */
export function closeDialog(element: HTMLDialogElement | null, onClosed: () => void) {
  if (!element || element.dataset.closing) return;
  element.dataset.closing = "true";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const animation = element.animate(
    [{ opacity: 1, transform: "none" }, { opacity: 0, transform: reduced ? "none" : "translateY(8px) scale(.98)" }],
    { duration: reduced ? 80 : 140, easing: "ease-in", fill: "forwards" },
  );
  void animation.finished.then(() => { if (element.isConnected) onClosed(); }).catch(() => {});
}
