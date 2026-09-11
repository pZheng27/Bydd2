// Photos are stored as object PATHS inside the public "item-photos" bucket
// (not full URLs), so the storage backend can change without a data migration.
const BUCKET = "item-photos";

/** Build a public URL for a stored photo path. */
export function publicPhotoUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${base}/storage/v1/object/public/${BUCKET}/${path}`;
}
