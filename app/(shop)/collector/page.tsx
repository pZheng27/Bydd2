import { redirect } from "next/navigation";

// The collector Overview was removed — Collection is the collector's home now.
// This keeps any old link or bookmark to /collector working.
export default function CollectorIndex() {
  redirect("/collection");
}
