import { NextResponse } from "next/server";

/**
 * GET /.well-known/farcaster.json
 *
 * Farcaster manifest for Base App discovery.
 * Declares CEOS as a Mini App and XMTP Chat Agent.
 */
export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://ceos.run";

  const manifest = {
    accountAssociation: {
      header: "eyJmaWQiOjAsInR5cGUiOiJjdXN0b2R5Iiwia2V5IjoiMHgwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwIn0",
      payload: "eyJkb21haW4iOiJjZW9zLnJ1biJ9",
      signature: "placeholder",
    },
    frame: {
      version: "1",
      name: "CEOS Score",
      iconUrl: `${appUrl}/icon.png`,
      homeUrl: `${appUrl}/miniapp`,
      splashImageUrl: `${appUrl}/splash.png`,
      splashBackgroundColor: "#0A0A0A",
      webhookUrl: `${appUrl}/api/webhooks/farcaster`,
    },
  };

  return NextResponse.json(manifest, {
    headers: {
      "Cache-Control": "public, max-age=3600",
    },
  });
}
