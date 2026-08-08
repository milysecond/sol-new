import { permanentRedirect } from "next/navigation";

/** Legacy alias → /draw */
export default function VrfAlias() {
  permanentRedirect("/draw");
}
