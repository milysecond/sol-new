import { redirect } from "next/navigation";

/** Canonical wallet entry → Get (receive / funds). Server redirect so content always lands. */
export default function WalletIndexPage() {
  redirect("/wallet/get");
}
