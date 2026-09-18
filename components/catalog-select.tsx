import { groupBySeries, type CoinType } from "@/lib/catalog";

/**
 * A native <select> of catalog coins, grouped by series. Server-rendered (no
 * client JS); used in forms that link an item or want to the catalog.
 */
export function CatalogSelect({
  coins,
  name,
  id,
  defaultValue,
  className,
  blankLabel = "— Not linked —",
}: {
  coins: CoinType[];
  name: string;
  id?: string;
  defaultValue?: string | null;
  className?: string;
  blankLabel?: string;
}) {
  return (
    <select
      id={id}
      name={name}
      defaultValue={defaultValue ?? ""}
      className={className}
    >
      <option value="">{blankLabel}</option>
      {groupBySeries(coins).map(([series, list]) => (
        <optgroup key={series} label={series}>
          {list.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
