/**
 * Regenerate public/og*.png from the new dark brand system.
 * Run: node scripts/gen-og-static.mjs
 */
import { writeFileSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createElement as h } from "react";
import { ImageResponse } from "next/og.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const publicDir = join(root, "public");
const logoB64 = `data:image/png;base64,${readFileSync(join(publicDir, "icon-512.png")).toString("base64")}`;

const ACCENTS = {
  purple: "#a855f7",
  orange: "#f97316",
  green: "#22c55e",
  blue: "#3b82f6",
  pink: "#d946ef",
};

function card({ title, subtitle, path, accent, eyebrow }) {
  const solid = ACCENTS[accent] || ACCENTS.purple;
  return new ImageResponse(
    h(
      "div",
      {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#050508",
          color: "white",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
          overflow: "hidden",
        },
      },
      h("div", {
        style: {
          position: "absolute",
          display: "flex",
          top: -180,
          right: -120,
          width: 640,
          height: 640,
          borderRadius: 999,
          background: `radial-gradient(circle, ${solid}66 0%, transparent 68%)`,
        },
      }),
      h("div", {
        style: {
          position: "absolute",
          display: "flex",
          left: 0,
          top: 0,
          bottom: 0,
          width: 8,
          background: solid,
        },
      }),
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            flex: 1,
            padding: "56px 72px 48px 80px",
            position: "relative",
          },
        },
        h(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            },
          },
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: 16 } },
            h("img", { src: logoB64, width: 52, height: 52, style: { borderRadius: 14 } }),
            h(
              "div",
              {
                style: {
                  display: "flex",
                  fontSize: 34,
                  fontWeight: 800,
                  letterSpacing: "-0.04em",
                },
              },
              h("span", null, "sol"),
              h("span", { style: { color: solid } }, ".new"),
            ),
          ),
          h(
            "div",
            { style: { display: "flex", fontSize: 22, color: "rgba(255,255,255,0.45)" } },
            path,
          ),
        ),
        h(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "column",
              flex: 1,
              justifyContent: "center",
              paddingTop: 24,
            },
          },
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: 12, marginBottom: 20 } },
            h("div", {
              style: { display: "flex", width: 36, height: 3, background: solid, borderRadius: 2 },
            }),
            h(
              "div",
              {
                style: {
                  display: "flex",
                  fontSize: 22,
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: solid,
                },
              },
              eyebrow,
            ),
          ),
          h(
            "div",
            {
              style: {
                display: "flex",
                fontSize: 72,
                fontWeight: 800,
                lineHeight: 1.05,
                letterSpacing: "-0.035em",
              },
            },
            title,
          ),
          h(
            "div",
            {
              style: {
                display: "flex",
                fontSize: 28,
                color: "rgba(255,255,255,0.62)",
                marginTop: 22,
                maxWidth: 860,
                lineHeight: 1.35,
              },
            },
            subtitle,
          ),
        ),
        h(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderTop: "1px solid rgba(255,255,255,0.1)",
              paddingTop: 28,
            },
          },
          h(
            "div",
            { style: { display: "flex", fontSize: 20, color: "rgba(255,255,255,0.45)" } },
            "Passkey-secured Solana tools",
          ),
          h(
            "div",
            {
              style: {
                display: "flex",
                padding: "14px 30px",
                borderRadius: 999,
                background: solid,
                fontSize: 22,
                fontWeight: 700,
              },
            },
            "Open sol.new",
          ),
        ),
      ),
    ),
    { width: 1200, height: 630 },
  );
}

const cards = [
  {
    file: "og.png",
    eyebrow: "sol.new",
    title: "Create on Solana",
    subtitle: "Tokens, NFTs, wallets, pay, gifts, and more. Face ID. No seed phrases.",
    path: "sol.new",
    accent: "purple",
  },
  {
    file: "og-token.png",
    eyebrow: "Token",
    title: "Launch a token",
    subtitle: "SPL token on Solana in seconds. Passkey-secured. Low fees.",
    path: "sol.new/token",
    accent: "orange",
  },
  {
    file: "og-nft.png",
    eyebrow: "NFT",
    title: "Mint an NFT",
    subtitle: "Standard or compressed. Upload an image and mint with Face ID.",
    path: "sol.new/nft",
    accent: "green",
  },
  {
    file: "og-multisig.png",
    eyebrow: "Multisig",
    title: "Shared wallets",
    subtitle: "Squads v4 multisig with multiple signers. Passkey members.",
    path: "sol.new/multisig",
    accent: "blue",
  },
  {
    file: "og-wallet.png",
    eyebrow: "Wallet",
    title: "Passkey wallet",
    subtitle: "Face ID or fingerprint. No seed phrases. Send, receive, and earn.",
    path: "sol.new/wallet",
    accent: "pink",
  },
];

for (const c of cards) {
  const res = await card(c);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(join(publicDir, c.file), buf);
  console.log("wrote", c.file, buf.length);
}
console.log("done");
