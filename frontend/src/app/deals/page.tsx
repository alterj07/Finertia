import { redirect } from "next/navigation";

// Deals was folded into Financial Operations' Close tab.
export default function Deals() {
  redirect("/financial-operations?tab=close");
}
