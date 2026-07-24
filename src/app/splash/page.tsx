import { redirect } from "next/navigation";

/** Alias for the marketing splash at /home */
export default function SplashRedirect() {
  redirect("/home");
}
