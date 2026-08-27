import { permanentRedirect } from "next/navigation";

/** Legacy VRF alias → Fair Draw (default wheel). */
export default function VrfAlias() {
  permanentRedirect("/draw?mode=wheel");
}
