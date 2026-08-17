import { permanentRedirect } from "next/navigation";

/** Frame tool removed — send people home. */
export default function FrameRemoved() {
  permanentRedirect("/home");
}
