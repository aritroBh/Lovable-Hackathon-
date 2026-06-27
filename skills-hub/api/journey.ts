import type { VercelRequest, VercelResponse } from "@vercel/node";
import { loadJourney, saveJourneyMerged } from "./lib/store";
import type { JourneyState } from "../src/journey";

export default function handler(req: VercelRequest, res: VercelResponse) {
  const userId =
    typeof req.query.userId === "string"
      ? req.query.userId
      : typeof req.body?.userId === "string"
        ? req.body.userId
        : "";

  if (!userId) {
    return res.status(400).json({ ok: false, error: "userId required" });
  }

  if (req.method === "GET") {
    return res.status(200).json({ ok: true, journey: loadJourney(userId) });
  }

  if (req.method === "POST") {
    const incoming = req.body?.journey as JourneyState | undefined;
    if (!incoming?.entries) {
      return res.status(400).json({ ok: false, error: "journey required" });
    }
    const merged = saveJourneyMerged(userId, incoming);
    return res.status(200).json({ ok: true, journey: merged });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
