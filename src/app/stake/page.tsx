import { redirect } from "next/navigation";

/** Alias: /stake → /earn (Lulo yield, not validator stake). */
export default function StakeRedirectPage() {
  redirect("/earn");
}
