import type { VercelRequest, VercelResponse } from "@vercel/node";
import { endTavusConversation } from "./lib/tavus";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const conversationId =
    typeof req.body?.conversationId === "string" ? req.body.conversationId.trim() : "";
  if (!conversationId) {
    return res.status(400).json({ ok: false, error: "Missing conversationId" });
  }

  const result = await endTavusConversation(conversationId);
  if (!result.ok) {
    return res.status(result.status).json({ ok: false, error: result.data });
  }
  return res.status(200).json({ ok: true });
}
