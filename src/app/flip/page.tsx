import { redirect } from "next/navigation";

/** Direct entry: coin flip */
export default function FlipPage() {
  redirect("/draw?mode=coin");
}
