import { permanentRedirect } from "next/navigation";

/** Direct entry: dice roll */
export default function DicePage() {
  permanentRedirect("/draw?mode=dice");
}