import type { VercelRequest, VercelResponse } from "@vercel/node";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { uploadsDir } from "../lib/store";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end("Method not allowed");
  }

  const filename = req.query.filename;
  if (typeof filename !== "string" || !/^[a-f0-9-]+\.(jpg|png)$/i.test(filename)) {
    return res.status(400).end("Invalid filename");
  }

  const path = join(uploadsDir(), filename);
  if (!existsSync(path)) {
    return res.status(404).end("Not found");
  }

  const buf = readFileSync(path);
  const mime = filename.endsWith(".png") ? "image/png" : "image/jpeg";
  res.setHeader("Content-Type", mime);
  res.setHeader("Cache-Control", "public, max-age=86400");
  return res.status(200).send(buf);
}
