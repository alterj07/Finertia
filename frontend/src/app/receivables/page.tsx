import { redirect } from "next/navigation";

// Receivables was folded into Financial Operations' AP/AR tab.
export default function Receivables() {
  redirect("/financial-operations?tab=ap-ar");
}
