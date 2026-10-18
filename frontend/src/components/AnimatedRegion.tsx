import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/** Retain the outgoing form only for its exit, with interaction disabled. */
export function AnimatedRegion({ children }: { children: ReactNode }) {
  const open = Boolean(children);
  const [wasOpen, setWasOpen] = useState(open);
  const [retained, setRetained] = useState(children);
  const element = useRef<HTMLDivElement>(null);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setRetained(children);
  }
  const content = open ? children : retained;
  useLayoutEffect(() => {
    const node = element.current;
    if (!node) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animation = node.animate(
      open
        ? [{ opacity: 0, transform: reduced ? "none" : "translateY(-8px)" }, { opacity: 1, transform: "none" }]
        : [{ opacity: 1, transform: "none" }, { opacity: 0, transform: reduced ? "none" : "translateY(-6px)" }],
      { duration: reduced ? 80 : open ? 240 : 150, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "backwards" },
    );
    if (!open) void animation.finished.then(() => setRetained(null)).catch(() => {});
    return () => animation.cancel();
  }, [open]);
  return content ? <div ref={element} className="finance-animated-region" inert={!open} aria-hidden={!open || undefined}>{content}</div> : null;
}
