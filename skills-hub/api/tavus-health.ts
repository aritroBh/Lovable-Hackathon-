import type { VercelRequest, VercelResponse } from "@vercel/node";

/** GET — env-only probe; does not create a Tavus conversation. */
export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const palReady = Boolean(
    process.env.TAVUS_API_KEY &&
      process.env.TAVUS_PERSONA_ID &&
      process.env.TAVUS_REPLICA_ID,
  );
  return res.status(palReady ? 200 : 503).json({ ok: palReady, palReady });
}
