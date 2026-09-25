"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Full-screen image overlay. Click the backdrop, press Escape, or hit ✕ to
 * close. Scroll to zoom (toward the cursor); when zoomed in, drag to pan.
 */
export function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  // Escape to close + lock page scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  // Wheel to zoom toward the cursor. Native, non-passive so it never scrolls
  // the page underneath.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - (rect.left + rect.width / 2);
      const cy = e.clientY - (rect.top + rect.height / 2);
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      setScale((s) => {
        const next = Math.min(8, Math.max(1, s * factor));
        if (next === 1) {
          setTx(0);
          setTy(0);
        } else {
          const applied = next / s;
          setTx((t) => cx - (cx - t) * applied);
          setTy((t) => cy - (cy - t) * applied);
        }
        return next;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function onPointerDown(e: React.PointerEvent) {
    if (scale <= 1) return;
    drag.current = { x: e.clientX - tx, y: e.clientY - ty };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    setTx(e.clientX - drag.current.x);
    setTy(e.clientY - drag.current.y);
  }
  function onPointerUp() {
    drag.current = null;
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/80 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        draggable={false}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          transformOrigin: "center",
        }}
        className={
          "max-h-[92vh] max-w-[92vw] rounded-lg object-contain shadow-2xl " +
          (scale > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in")
        }
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 rounded-full bg-white/90 px-2.5 py-1 text-lg leading-6 text-black shadow hover:bg-white"
      >
        ✕
      </button>
      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/85 px-3 py-1 text-xs font-medium text-black shadow">
        Scroll to zoom · drag to pan · click outside to close
      </div>
    </div>
  );
}
