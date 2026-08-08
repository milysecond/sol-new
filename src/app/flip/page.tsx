import { permanentRedirect } from "next/navigation";

/** Direct entry: coin flip */
export default function FlipPage() {
  permanentRedirect("/draw?mode=coin");
}
