import { redirect } from "next/navigation";

/** Alias: /stake → /earn (stablecoin yield, not validator stake). */
export default function StakeRedirectPage() {
  redirect("/earn");
}
