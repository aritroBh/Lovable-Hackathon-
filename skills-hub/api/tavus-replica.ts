import type { VercelRequest, VercelResponse } from "@vercel/node";
import { loadReplica, saveReplica } from "./lib/store";
import { isReplicaReady, tavusFetch } from "./lib/tavus";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const userId =
    (typeof req.query?.userId === "string" ? req.query.userId : null) ||
    (typeof req.body?.userId === "string" ? req.body.userId : null) ||
    "specter-demo";

  if (req.method === "GET") {
    const stored = loadReplica(userId);
    if (!stored?.replica_id) {
      return res.status(200).json({
        ok: true,
        replica_id: null,
        status: "none",
        ready: false,
      });
    }

    const { ok, status, data } = await tavusFetch(
      `/faces/${stored.replica_id}`,
    );
    if (!ok) {
      return res.status(status).json({ ok: false, error: data });
    }

    const remoteStatus =
      typeof data.status === "string" ? data.status : stored.status;
    const ready = isReplicaReady(remoteStatus);
    if (remoteStatus !== stored.status || ready) {
      saveReplica({
        ...stored,
        status: remoteStatus,
        updatedAt: new Date().toISOString(),
      });
    }

    return res.status(200).json({
      ok: true,
      replica_id: stored.replica_id,
      status: remoteStatus,
      ready,
      uploadUrl: stored.uploadUrl,
    });
  }

  if (req.method === "POST") {
    const uploadUrl =
      typeof req.body?.uploadUrl === "string" ? req.body.uploadUrl : "";
    const voiceName =
      typeof req.body?.voiceName === "string" ? req.body.voiceName : "anna";
    const replicaName =
      typeof req.body?.replicaName === "string"
        ? req.body.replicaName
        : `specter-user-${userId.slice(0, 12)}`;

    if (!uploadUrl) {
      return res.status(400).json({ ok: false, error: "uploadUrl required" });
    }

    const { ok, status, data } = await tavusFetch("/faces", {
      method: "POST",
      body: JSON.stringify({
        face_name: replicaName,
        train_image_url: uploadUrl,
        voice_name: voiceName,
        auto_fix_training_image: true,
      }),
    });

    if (!ok) {
      return res.status(status).json({ ok: false, error: data });
    }

    const replicaId =
      typeof data.face_id === "string"
        ? data.face_id
        : typeof data.replica_id === "string"
          ? data.replica_id
          : null;
    const replicaStatus =
      typeof data.status === "string" ? data.status : "training";

    if (!replicaId) {
      return res.status(502).json({ ok: false, error: "No replica_id returned" });
    }

    const now = new Date().toISOString();
    saveReplica({
      userId,
      replica_id: replicaId,
      status: replicaStatus,
      uploadUrl,
      createdAt: now,
      updatedAt: now,
    });

    return res.status(200).json({
      ok: true,
      replica_id: replicaId,
      status: replicaStatus,
      ready: isReplicaReady(replicaStatus),
    });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
