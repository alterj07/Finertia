import { redirect } from "next/navigation";

// Payables was folded into Financial Operations' AP/AR tab.
export default function Payables() {
  redirect("/financial-operations?tab=ap-ar");
}
