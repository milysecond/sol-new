import { NextRequest, NextResponse } from "next/server";
import { initDb, getProposals, getVotes } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: { mint: string } }) {
  await initDb().catch(() => {});
  const proposals = await getProposals(params.mint);

  const withVotes = await Promise.all(
    proposals.map(async (p) => {
      const votes = await getVotes(p.id as string);
      const yes = votes.filter((v) => v.choice === "yes").length;
      const no = votes.filter((v) => v.choice === "no").length;
      return { ...p, votes: { yes, no, total: votes.length } };
    }),
  );

  return NextResponse.json({ proposals: withVotes });
}
