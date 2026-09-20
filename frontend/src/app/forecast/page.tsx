import { redirect } from "next/navigation";

// Forecast was folded into Financial Operations' Forecast tab.
export default function Forecast() {
  redirect("/financial-operations?tab=forecast");
}
