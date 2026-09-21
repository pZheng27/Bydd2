"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseCsv } from "@/lib/csv";
import { getCoinTypes, type CoinType } from "@/lib/catalog";
import type { SupabaseClient } from "@supabase/supabase-js";

const SERVICES = ["PCGS", "NGC", "CAC", "ANACS", "ICG"];

function toInt(v: string | undefined): number | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
}
function toCents(v: string | undefined): number | null {
  const s = (v ?? "").replace(/[$,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : Math.round(n * 100);
}
function gradeVal(v: string | undefined): number | null {
  const n = toInt(v);
  return n != null && n >= 1 && n <= 70 ? n : null;
}
function normMint(v: string | null | undefined): string | null {
  const s = (v ?? "").trim().toUpperCase();
  if (!s || s === "P" || s === "PHIL" || s === "PHILADELPHIA") return null;
  return s;
}
function normService(v: string | undefined): string | null {
  const s = (v ?? "").trim().toUpperCase();
  if (!s) return null;
  if (SERVICES.includes(s)) return s;
  if (["RAW", "NONE", "UNGRADED", "UNC"].includes(s)) return "raw";
  return null; // unknown grader → leave blank rather than break the insert
}
function clean(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  return s ? s : null;
}

// Accept a few header spellings for the same field.
function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) if (row[k] != null && row[k] !== "") return row[k];
  return "";
}

function seriesMatch(a: string, b: string): boolean {
  return a.includes(b) || b.includes(a);
}

type Match = { ct: CoinType } | "ambiguous" | null;

function matchRow(coins: CoinType[], row: Record<string, string>): Match {
  const series = pick(row, "series").toLowerCase();
  const year = toInt(pick(row, "year"));
  const mint = normMint(pick(row, "mintmark", "mint"));
  const variety = pick(row, "variety").toLowerCase();
  if (!series || year == null) return null;

  let cands = coins.filter(
    (ct) =>
      ct.year === year &&
      normMint(ct.mintmark) === mint &&
      seriesMatch(ct.series.toLowerCase(), series),
  );
  if (cands.length > 1 && variety) {
    const v = cands.filter((ct) => {
      const cv = (ct.variety ?? "").toLowerCase();
      return cv && (cv.includes(variety) || variety.includes(cv));
    });
    if (v.length) cands = v;
  } else if (cands.length > 1 && !variety) {
    const plain = cands.filter((ct) => !ct.variety);
    if (plain.length === 1) cands = plain;
  }
  if (cands.length === 1) return { ct: cands[0] };
  if (cands.length > 1) return "ambiguous";
  return null;
}

function buildTitle(row: Record<string, string>, ct: CoinType | null): string {
  if (ct) {
    const g = [pick(row, "service"), pick(row, "grade"), pick(row, "designation")]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ");
    return g ? `${ct.name} ${g}` : ct.name;
  }
  const year = pick(row, "year");
  const mint = normMint(pick(row, "mintmark", "mint"));
  const head = `${year}${mint ? `-${mint}` : ""}`.trim();
  const parts = [head, pick(row, "series"), pick(row, "grade"), pick(row, "service")]
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.join(" ") || "Untitled coin";
}

async function myDealerId(supabase: SupabaseClient): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: prof } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!prof) return null;
  const { data: dealer } = await supabase
    .from("dealers")
    .select("id")
    .eq("profile_id", prof.id)
    .maybeSingle();
  if (dealer) return dealer.id;
  const created = await supabase
    .from("dealers")
    .insert({ profile_id: prof.id })
    .select("id")
    .single();
  return created.data?.id ?? null;
}

export type ImportRowReport = {
  line: number;
  title: string;
  match: string;
  matched: boolean;
  imported: boolean;
  note?: string;
};

export type ImportReport =
  | {
      ok: true;
      committed: boolean;
      total: number;
      matched: number;
      imported: number;
      failed: number;
      rows: ImportRowReport[];
    }
  | { ok: false; error: string };

/**
 * Parse an inventory CSV and either preview (commit=false) or import
 * (commit=true) it. Every row is imported as an UNLISTED item (listing happens
 * only via /sell); rows are matched to the catalog by series/year/mintmark when
 * possible. Blanks are tolerated and unmatched rows are reported, never fatal.
 */
export async function importInventory(
  csvText: string,
  commit: boolean,
): Promise<ImportReport> {
  const text = (csvText ?? "").trim();
  if (!text) return { ok: false, error: "Paste your CSV first." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in." };

  const { rows } = parseCsv(text);
  if (rows.length === 0)
    return { ok: false, error: "No data rows found. Include a header row." };

  const coins = await getCoinTypes(supabase);

  let dealerId: string | null = null;
  if (commit) {
    dealerId = await myDealerId(supabase);
    if (!dealerId) return { ok: false, error: "Couldn't find your dealer profile." };
  }

  const report: ImportRowReport[] = [];
  let matched = 0;
  let imported = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const m = matchRow(coins, row);
    const ct = m && m !== "ambiguous" ? m.ct : null;
    if (ct) matched++;
    const title = buildTitle(row, ct);
    const note =
      m === "ambiguous"
        ? "Multiple catalog matches — imported without a link"
        : ct
          ? undefined
          : "No catalog match — imported without a link";

    const rep: ImportRowReport = {
      line: i + 1,
      title,
      match: ct ? ct.name : "—",
      matched: !!ct,
      imported: false,
      note,
    };

    if (commit && dealerId) {
      const priceCents = toCents(pick(row, "price"));
      const costCents = toCents(pick(row, "cost"));
      const { data: inv, error } = await supabase
        .from("inventory_items")
        .insert({
          dealer_id: dealerId,
          coin_type_id: ct?.id ?? null,
          series: clean(pick(row, "series")),
          year: toInt(pick(row, "year")),
          mintmark: normMint(pick(row, "mintmark", "mint")),
          variety: clean(pick(row, "variety")),
          metal: ct?.metal ?? null,
          fine_weight_oz: ct?.fine_weight_oz ?? null,
          grade: gradeVal(pick(row, "grade")),
          designation: clean(pick(row, "designation")),
          grading_service: normService(pick(row, "service", "grading_service")),
          cert_number: clean(pick(row, "cert", "cert_number")),
          price_cents: priceCents ?? 0,
          status: "unlisted",
          is_public: false,
          location_note: clean(pick(row, "location_note", "location")),
          title,
        })
        .select("id")
        .single();

      if (error || !inv) {
        failed++;
        rep.note = `Couldn't import: ${error?.message ?? "unknown error"}`;
      } else {
        imported++;
        rep.imported = true;
        if (costCents != null) {
          await supabase
            .from("inventory_costs")
            .insert({ inventory_item_id: inv.id, cost_cents: costCents });
        }
      }
    }

    report.push(rep);
  }

  if (commit) revalidatePath("/dealer/inventory");

  return {
    ok: true,
    committed: commit,
    total: rows.length,
    matched,
    imported,
    failed,
    rows: report,
  };
}
