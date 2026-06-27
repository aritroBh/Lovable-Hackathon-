import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "crypto";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { uploadsDir } from "./lib/store";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png"]);

function ensureUploadsDir() {
  const dir = uploadsDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const imageBase64 =
    typeof req.body?.imageBase64 === "string" ? req.body.imageBase64 : "";
  const mimeType =
    typeof req.body?.mimeType === "string" ? req.body.mimeType : "image/jpeg";

  if (!imageBase64) {
    return res.status(400).json({ ok: false, error: "imageBase64 required" });
  }
  if (!ALLOWED.has(mimeType)) {
    return res.status(400).json({ ok: false, error: "Only JPG/PNG allowed" });
  }

  const buf = Buffer.from(imageBase64, "base64");
  if (buf.length === 0 || buf.length > MAX_BYTES) {
    return res.status(400).json({ ok: false, error: "Invalid image size (max 5MB)" });
  }

  const ext = mimeType === "image/png" ? "png" : "jpg";
  const id = randomUUID();
  const filename = `${id}.${ext}`;
  ensureUploadsDir();
  const dir = uploadsDir();
  writeFileSync(join(dir, filename), buf);

  const host = req.headers.host;
  const base =
    process.env.TAVUS_PUBLIC_BASE_URL?.replace(/\/$/, "") ||
    (host ? `https://${host}` : "http://127.0.0.1:3001");
  const uploadUrl = `${base}/api/uploads/${filename}`;

  return res.status(200).json({ ok: true, uploadUrl, filename });
}
