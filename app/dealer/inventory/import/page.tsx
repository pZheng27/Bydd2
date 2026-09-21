import Link from "next/link";
import { ImportInventoryForm } from "@/components/import-inventory-form";

export default function ImportInventoryPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dealer/inventory" className="hover:underline">
          Inventory
        </Link>
        <span>/</span>
        <span>Import CSV</span>
      </div>
      <h1 className="mt-1 text-2xl font-semibold">Import inventory from CSV</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Bulk-add coins from a spreadsheet. Preview first to see what will link to
        the catalog, then import. Coins you can&apos;t match still import — you
        can link them to the catalog later on each item.
      </p>

      <ImportInventoryForm />
    </div>
  );
}
