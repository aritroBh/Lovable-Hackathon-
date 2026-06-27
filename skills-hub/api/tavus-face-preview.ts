import type { VercelRequest, VercelResponse } from "@vercel/node";
import { tavusFetch } from "./lib/tavus";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const faceId = process.env.TAVUS_REPLICA_ID;
  if (!faceId) {
    return res.status(503).json({ ok: false, error: "Missing TAVUS_REPLICA_ID" });
  }

  const { ok, status, data } = await tavusFetch(`/faces/${encodeURIComponent(faceId)}`);
  if (!ok) {
    return res.status(status === 503 ? 503 : 502).json({
      ok: false,
      error: typeof data.error === "string" ? data.error : "Tavus face fetch failed",
    });
  }

  return res.status(200).json({
    ok: true,
    face_id: faceId,
    face_name: typeof data.face_name === "string" ? data.face_name : null,
    thumbnail_video_url:
      typeof data.thumbnail_video_url === "string" ? data.thumbnail_video_url : null,
  });
}
