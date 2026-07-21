import { redirect } from "next/navigation";

/** Legacy URL Google still crawls — fold into privacy. */
export default function CopyrightPage() {
  redirect("/privacy");
}
