import { redirect } from "next/navigation";

/** Legacy alias → /draw */
export default function VrfAlias() {
  redirect("/draw");
}
