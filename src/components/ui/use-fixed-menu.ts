"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

export type FixedMenuPos = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  place: "below" | "above";
};

export function useFixedMenu(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  opts?: { minSpace?: number; maxMenu?: number }
) {
  const minSpace = opts?.minSpace ?? 160;
  const maxMenu = opts?.maxMenu ?? 280;
  const [pos, setPos] = useState<FixedMenuPos | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }

    function update() {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const gap = 4;
      const spaceBelow = window.innerHeight - r.bottom - gap - 8;
      const spaceAbove = r.top - gap - 8;
      const preferBelow = spaceBelow >= minSpace || spaceBelow >= spaceAbove;
      setPos({
        left: r.left,
        width: r.width,
        maxHeight: Math.max(120, Math.min(maxMenu, preferBelow ? spaceBelow : spaceAbove)),
        place: preferBelow ? "below" : "above",
        top: preferBelow ? r.bottom + gap : r.top - gap,
      });
    }

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, triggerRef, minSpace, maxMenu]);

  return pos;
}
