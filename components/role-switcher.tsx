import { setRole, type ActiveRole } from "@/app/actions";
import { cn } from "@/lib/utils";

const ROLES: { key: ActiveRole; label: string }[] = [
  { key: "collector", label: "Collector" },
  { key: "dealer", label: "Dealer" },
];

/** Header control that switches between the Collector and Dealer views. */
export function RoleSwitcher({ active }: { active: ActiveRole }) {
  return (
    <div className="inline-flex rounded-lg border p-0.5">
      {ROLES.map((r) => (
        <form key={r.key} action={setRole}>
          <input type="hidden" name="role" value={r.key} />
          <button
            type="submit"
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active === r.key
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {r.label}
          </button>
        </form>
      ))}
    </div>
  );
}
