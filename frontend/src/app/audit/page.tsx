import { redirect } from "next/navigation";

// Audit & Controls was folded into Financial Operations' Audit tab.
export default function Audit() {
  redirect("/financial-operations?tab=audit");
}
