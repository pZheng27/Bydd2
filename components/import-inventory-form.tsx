"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  importInventory,
  type ImportReport,
} from "@/app/dealer/inventory/import-actions";
import { Button } from "@/components/ui/button";

const SAMPLE = `series,year,mintmark,variety,grade,designation,service,cert,cost,price,status,location_note
Morgan Dollar,1889,CC,,50,,PCGS,12345678,3200,4200,,Box A
Peace Dollar,1921,,,58,,NGC,,800,1400,,Box B
Lincoln Cent,1909,S,VDB,45,RD,PCGS,,700,1100,,
Mercury Dime,1916,D,,20,,PCGS,,900,1500,,`;

export function ImportInventoryForm() {
  const [csv, setCsv] = useState("");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [pending, setPending] = useState<"preview" | "import" | null>(null);
  const router = useRouter();

  async function run(commit: boolean) {
    setPending(commit ? "import" : "preview");
    setReport(null);
    try {
      const res = await importInventory(csv, commit);
      setReport(res);
      if (res.ok && res.committed && res.imported > 0) router.refresh();
    } catch {
      setReport({ ok: false, error: "Something went wrong. Please try again." });
    } finally {
      setPending(null);
    }
  }

  const previewed = report?.ok && !report.committed;

  return (
    <div className="mt-6 space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="csv" className="text-sm font-medium">
            Paste your inventory CSV
          </label>
          <button
            type="button"
            onClick={() => setCsv(SAMPLE)}
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            Load sample
          </button>
        </div>
        <textarea
          id="csv"
          value={csv}
          onChange={(e) => {
            setCsv(e.target.value);
            setReport(null);
          }}
          rows={10}
          placeholder="series,year,mintmark,variety,grade,designation,service,cert,cost,price,status,location_note"
          className="w-full rounded-md border bg-background px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
        />
        <p className="text-xs text-muted-foreground">
          First row must be the column headers. Columns:{" "}
          <span className="font-mono">
            series, year, mintmark, variety, grade, designation, service, cert,
            cost, price, status, location_note
          </span>
          . Blanks are fine. For auto-linking to the catalog, use series names
          like &ldquo;Morgan Dollar&rdquo;, &ldquo;Peace Dollar&rdquo;,
          &ldquo;Lincoln Cent&rdquo;, &ldquo;Mercury Dime&rdquo;.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => run(false)}
          disabled={!csv.trim() || pending !== null}
        >
          {pending === "preview" ? "Checking…" : "Preview"}
        </Button>
        <Button
          type="button"
          onClick={() => run(true)}
          disabled={!csv.trim() || pending !== null}
        >
          {pending === "import"
            ? "Importing…"
            : previewed
              ? `Import ${report.total} coin${report.total === 1 ? "" : "s"}`
              : "Import"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Imported coins land as <span className="font-medium">unlisted</span> —
          list them later from the item page.
        </span>
      </div>

      {report && !report.ok && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {report.error}
        </div>
      )}

      {report && report.ok && (
        <div className="space-y-3">
          <div className="rounded-md border p-3 text-sm">
            {report.committed ? (
              <p>
                <span className="font-medium">
                  Imported {report.imported} of {report.total}
                </span>{" "}
                — {report.matched} linked to the catalog
                {report.failed > 0 ? `, ${report.failed} failed` : ""}.{" "}
                <Link href="/dealer/inventory" className="underline">
                  View inventory
                </Link>
              </p>
            ) : (
              <p>
                <span className="font-medium">Preview:</span> {report.total} row
                {report.total === 1 ? "" : "s"} · {report.matched} will link to
                the catalog · {report.total - report.matched} will import without
                a link. Nothing saved yet — click{" "}
                <span className="font-medium">Import</span> to save.
              </p>
            )}
          </div>

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">#</th>
                  <th className="px-3 py-2 text-left font-medium">Coin</th>
                  <th className="px-3 py-2 text-left font-medium">Catalog match</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {report.rows.map((r) => (
                  <tr key={r.line}>
                    <td className="px-3 py-2 text-muted-foreground">{r.line}</td>
                    <td className="px-3 py-2">{r.title}</td>
                    <td className="px-3 py-2">
                      {r.matched ? (
                        <span className="text-green-700 dark:text-green-400">
                          {r.match}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {report.committed
                        ? r.imported
                          ? r.note ?? "Imported ✓"
                          : r.note ?? "Not imported"
                        : r.note ?? "Ready"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
