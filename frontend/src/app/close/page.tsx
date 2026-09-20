import { redirect } from "next/navigation";

// Close (and the Deals inbox nested inside it) was folded into Financial
// Operations' Close tab.
export default function Close() {
  redirect("/financial-operations?tab=close");
}
