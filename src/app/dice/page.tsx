import { redirect } from "next/navigation";

/** Direct entry: dice roll */
export default function DicePage() {
  redirect("/draw?mode=dice");
}