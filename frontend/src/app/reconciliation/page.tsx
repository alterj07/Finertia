import { redirect } from "next/navigation";

// Reconciliation was folded into Financial Operations' Reconciliation tab.
export default function Reconciliation() {
  redirect("/financial-operations?tab=reconciliation");
}
