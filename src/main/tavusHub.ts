/**
 * ponytail: thin fetch wrapper — Skills Hub Tavus routes from Mac overlay
 */
import { safeError, safeLog } from "./logger";

function hubUrl(): string | null {
  const u = process.env.SKILLS_HUB_URL?.replace(/\/$/, "");
  return u || null;
}

function userId(): string {
  return process.env.SPECTER_USER_ID || "mac-local";
}

async function hubJson(
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const hub = hubUrl();
  if (!hub) {
    return {
      ok: false,
      status: 503,
      data: { error: "SKILLS_HUB_URL not configured" },
    };
  }
  try {
    const res = await fetch(`${hub}${path}`, init);
    const data = (await res.json()) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    safeError("[tavusHub] fetch failed", e);
    return {
      ok: false,
      status: 502,
      data: { error: e instanceof Error ? e.message : String(e) },
    };
  }
}

export async function tavusUploadPhoto(
  imageBase64: string,
  mimeType: string,
): Promise<{ ok: boolean; uploadUrl?: string; error?: string }> {
  const { ok, data } = await hubJson("/api/tavus-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64, mimeType, userId: userId() }),
  });
  if (!ok) {
    return {
      ok: false,
      error:
        typeof data.error === "string" ? data.error : JSON.stringify(data.error ?? data),
    };
  }
  return {
    ok: true,
    uploadUrl: typeof data.uploadUrl === "string" ? data.uploadUrl : undefined,
  };
}

export async function tavusCreateReplica(
  uploadUrl: string,
): Promise<{
  ok: boolean;
  replica_id?: string;
  status?: string;
  ready?: boolean;
  error?: string;
}> {
  const { ok, data } = await hubJson("/api/tavus-replica", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uploadUrl, userId: userId() }),
  });
  if (!ok) {
    return {
      ok: false,
      error:
        typeof data.error === "string" ? data.error : JSON.stringify(data.error ?? data),
    };
  }
  safeLog("[tavusHub] replica training started", { replica_id: data.replica_id });
  return {
    ok: true,
    replica_id: typeof data.replica_id === "string" ? data.replica_id : undefined,
    status: typeof data.status === "string" ? data.status : undefined,
    ready: data.ready === true,
  };
}

export async function tavusGetReplicaStatus(): Promise<{
  ok: boolean;
  replica_id?: string | null;
  status?: string;
  ready?: boolean;
  uploadUrl?: string;
  error?: string;
}> {
  const uid = encodeURIComponent(userId());
  const { ok, data } = await hubJson(`/api/tavus-replica?userId=${uid}`);
  if (!ok) {
    return {
      ok: false,
      error:
        typeof data.error === "string" ? data.error : JSON.stringify(data.error ?? data),
    };
  }
  return {
    ok: true,
    replica_id:
      typeof data.replica_id === "string" || data.replica_id === null
        ? data.replica_id
        : undefined,
    status: typeof data.status === "string" ? data.status : undefined,
    ready: data.ready === true,
    uploadUrl: typeof data.uploadUrl === "string" ? data.uploadUrl : undefined,
  };
}

export async function tavusStartConversation(opts: {
  memoryContext?: string;
  replicaId?: string | null;
  replicaReady?: boolean;
}): Promise<{
  ok: boolean;
  conversation_url?: string;
  conversation_id?: string;
  using_custom_replica?: boolean;
  error?: string;
}> {
  const { ok, data } = await hubJson("/api/tavus-conversation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: "overlay",
      userId: userId(),
      memoryContext: opts.memoryContext || "",
      replicaId: opts.replicaId || undefined,
      replicaReady: opts.replicaReady === true,
    }),
  });
  if (!ok) {
    return {
      ok: false,
      error:
        typeof data.error === "string" ? data.error : JSON.stringify(data.error ?? data),
    };
  }
  return {
    ok: true,
    conversation_url:
      typeof data.conversation_url === "string" ? data.conversation_url : undefined,
    conversation_id:
      typeof data.conversation_id === "string" ? data.conversation_id : undefined,
    using_custom_replica: data.using_custom_replica === true,
  };
}

export function tavusHubConfigured(): boolean {
  return Boolean(hubUrl());
}

export async function tavusPalAvailable(): Promise<boolean> {
  if (!hubUrl()) return false;
  const { ok, status } = await hubJson("/api/tavus-health");
  return ok && status === 200;
}
