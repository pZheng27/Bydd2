/** A lightweight loading placeholder shown while a route's data loads. */
export function PageSkeleton() {
  return (
    <div className="mx-auto max-w-4xl animate-pulse" aria-hidden="true">
      <div className="h-7 w-48 rounded bg-muted" />
      <div className="mt-3 h-4 w-72 rounded bg-muted" />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="h-24 rounded-xl bg-muted" />
        <div className="h-24 rounded-xl bg-muted" />
        <div className="h-24 rounded-xl bg-muted" />
        <div className="h-24 rounded-xl bg-muted" />
        <div className="h-24 rounded-xl bg-muted" />
        <div className="h-24 rounded-xl bg-muted" />
      </div>
    </div>
  );
}
