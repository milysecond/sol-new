import { redirect } from "next/navigation";

/** Direct entry: wheel mode */
export default function WheelPage() {
  redirect("/draw?mode=wheel");
}
