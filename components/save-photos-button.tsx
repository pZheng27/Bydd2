"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// A "Save Photos" control for the add-coin form footer: downloads the photos
// that would be submitted (the same hidden `photos` inputs the form posts) to
// the user's computer, as PNG or JPG. Conversion happens in the browser via a
// canvas — JPG has no transparency, so cut-outs are flattened onto white.

type Fmt = "png" | "jpg";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // storage sends CORS, so the canvas stays clean
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

async function toFormatBlob(url: string, fmt: Fmt): Promise<Blob | null> {
  const img = await loadImage(url);
  const c = document.createElement("canvas");
  c.width = img.naturalWidth || 1;
  c.height = img.naturalHeight || 1;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  if (fmt === "jpg") {
    ctx.fillStyle = "#ffffff"; // JPG can't be transparent
    ctx.fillRect(0, 0, c.width, c.height);
  }
  ctx.drawImage(img, 0, 0);
  return new Promise((resolve) => {
    try {
      c.toBlob(
        (b) => resolve(b),
        fmt === "jpg" ? "image/jpeg" : "image/png",
        0.95,
      );
    } catch {
      resolve(null);
    }
  });
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeBase(form: HTMLFormElement): string {
  const title = (
    form.querySelector('input[name="title"]') as HTMLInputElement | null
  )?.value;
  const base = (title || "coin")
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "coin";
}

export function SavePhotosButton() {
  const [fmt, setFmt] = useState<Fmt>("png");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const supabase = createClient();

  async function save() {
    const form = btnRef.current?.form;
    if (!form) return;
    const paths = Array.from(
      form.querySelectorAll<HTMLInputElement>('input[name="photos"]'),
    )
      .map((i) => i.value)
      .filter(Boolean);
    if (!paths.length) {
      setMsg("Add a photo first.");
      setTimeout(() => setMsg(null), 3000);
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const base = safeBase(form);
      let saved = 0;
      for (let i = 0; i < paths.length; i++) {
        const url = supabase.storage
          .from("item-photos")
          .getPublicUrl(paths[i])
          .data.publicUrl;
        const blob = await toFormatBlob(url, fmt);
        if (blob) {
          const name =
            paths.length === 1 ? `${base}.${fmt}` : `${base}-${i + 1}.${fmt}`;
          download(blob, name);
          saved += 1;
        }
      }
      setMsg(
        saved
          ? `Saved ${saved} photo${saved === 1 ? "" : "s"}.`
          : "Couldn't save the photos.",
      );
      setTimeout(() => setMsg(null), 3000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      {/* PNG / JPG toggle */}
      <div className="inline-flex overflow-hidden rounded-md border text-xs">
        {(["png", "jpg"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFmt(f)}
            className={
              "px-2.5 py-1.5 font-medium uppercase " +
              (fmt === f
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted") +
              (f === "jpg" ? " border-l" : "")
            }
          >
            {f}
          </button>
        ))}
      </div>
      <button
        ref={btnRef}
        type="button"
        onClick={save}
        disabled={busy}
        className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-60"
      >
        {busy ? "Saving…" : "Save Photos"}
      </button>
    </div>
  );
}
