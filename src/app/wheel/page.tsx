import { permanentRedirect } from "next/navigation";

/** Direct entry: wheel mode */
export default function WheelPage() {
  permanentRedirect("/draw?mode=wheel");
}
