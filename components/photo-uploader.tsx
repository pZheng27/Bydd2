"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Uploaded = { path: string; url: string };

/**
 * Uploads chosen images directly to Supabase Storage from the browser, and
 * emits the resulting object paths as hidden <input name="photos"> fields so
 * the surrounding form's server action can save them on the item.
 */
export function PhotoUploader({
  dealerId,
  prefix,
}: {
  dealerId?: string;
  prefix?: string;
}) {
  const folder = prefix ?? dealerId ?? "misc";
  const [items, setItems] = useState<Uploaded[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  async function onSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of files) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${folder}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("item-photos")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) {
          setError(upErr.message);
          continue;
        }
        const { data } = supabase.storage.from("item-photos").getPublicUrl(path);
        setItems((prev) => [...prev, { path, url: data.publicUrl }]);
      }
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  async function remove(path: string) {
    setItems((prev) => prev.filter((i) => i.path !== path));
    await supabase.storage.from("item-photos").remove([path]);
  }

  return (
    <div className="space-y-2">
      {items.map((it) => (
        <input key={it.path} type="hidden" name="photos" value={it.path} />
      ))}
      <div className="flex flex-wrap gap-3">
        {items.map((it) => (
          <div key={it.path} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={it.url}
              alt="Coin photo"
              className="h-24 w-24 rounded-md border object-cover"
            />
            <button
              type="button"
              onClick={() => remove(it.path)}
              className="absolute -right-2 -top-2 rounded-full border bg-background px-1.5 text-xs leading-5 hover:bg-muted"
              aria-label="Remove photo"
            >
              ✕
            </button>
          </div>
        ))}
        <label className="flex h-24 w-24 cursor-pointer items-center justify-center rounded-md border border-dashed p-2 text-center text-xs text-muted-foreground hover:bg-muted">
          {busy ? "Uploading…" : "+ Add photo"}
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={onSelect}
            disabled={busy}
          />
        </label>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
