import { redirect } from "next/navigation";

// Deals was folded into the Close screen; send old links there.
export default function Deals() {
  redirect("/close");
}
