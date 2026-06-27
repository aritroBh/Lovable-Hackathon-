/** ponytail: shared Tavus helpers for Hub API routes */

export function resolveReplicaId(opts: {
  clientReplicaId?: string | null;
  clientReplicaReady?: boolean;
  envReplicaId?: string | null;
}): string | undefined {
  if (opts.clientReplicaId && opts.clientReplicaReady) return opts.clientReplicaId;
  if (opts.envReplicaId) return opts.envReplicaId;
  return undefined;
}

// ponytail: runnable self-check — fails if resolution order breaks
if (process.env.TAVUS_RESOLVE_SELF_CHECK === "1") {
  const a = resolveReplicaId({
    clientReplicaId: "user-rep",
    clientReplicaReady: true,
    envReplicaId: "env-rep",
  });
  const b = resolveReplicaId({
    clientReplicaId: "user-rep",
    clientReplicaReady: false,
    envReplicaId: "env-rep",
  });
  const c = resolveReplicaId({ envReplicaId: "env-rep" });
  if (a !== "user-rep" || b !== "env-rep" || c !== "env-rep") {
    throw new Error("resolveReplicaId self-check failed");
  }
}

export function isReplicaReady(status: string | undefined): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return s === "completed" || s === "ready" || s === "done";
}

export function publicBaseUrl(reqHost?: string): string {
  const env = process.env.TAVUS_PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (env) return env;
  if (reqHost) return `https://${reqHost}`;
  return "http://127.0.0.1:3001";
}

export async function tavusFetch(
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const apiKey = process.env.TAVUS_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 503, data: { error: "Missing TAVUS_API_KEY" } };
  }
  const res = await fetch(`https://tavusapi.com/v2${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      ...(init?.headers || {}),
    },
  });
  const data = (await res.json()) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, data };
}

function tavusErrorText(data: Record<string, unknown>): string {
  return JSON.stringify(data).toLowerCase();
}

export function isInvalidReplicaError(data: Record<string, unknown>): boolean {
  const s = tavusErrorText(data);
  const aboutFace =
    s.includes("replica") || s.includes("face") || s.includes("face_id");
  return aboutFace && (s.includes("invalid") || s.includes("not found"));
}

export function isConcurrencyLimitError(data: Record<string, unknown>): boolean {
  return tavusErrorText(data).includes("maximum concurrent conversations");
}

/** ponytail: retry without bad client replica, then env replica, then persona default */
export async function createTavusConversation(
  body: Record<string, unknown>,
  opts: {
    resolvedReplicaId?: string;
    envReplicaId?: string;
    clientReplicaReady?: boolean;
  },
): Promise<{
  ok: boolean;
  status: number;
  data: Record<string, unknown>;
  replica_id: string | null;
}> {
  const tryCreate = async (replicaId?: string) => {
    const payload = { ...body };
    if (replicaId) payload.face_id = replicaId;
    else delete payload.face_id;
    return tavusFetch("/conversations", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  };

  let replicaUsed = opts.resolvedReplicaId || null;
  let result = await tryCreate(opts.resolvedReplicaId);

  if (
    !result.ok &&
    opts.resolvedReplicaId &&
    isInvalidReplicaError(result.data) &&
    opts.envReplicaId &&
    opts.envReplicaId !== opts.resolvedReplicaId
  ) {
    replicaUsed = opts.envReplicaId;
    result = await tryCreate(opts.envReplicaId);
  }

  if (!result.ok && replicaUsed && isInvalidReplicaError(result.data)) {
    replicaUsed = null;
    result = await tryCreate(undefined);
  }

  const status = !result.ok && isConcurrencyLimitError(result.data) ? 503 : result.status;
  return { ok: result.ok, status, data: result.data, replica_id: replicaUsed };
}

export async function endTavusConversation(
  conversationId: string,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  if (!conversationId) {
    return { ok: false, status: 400, data: { error: "Missing conversationId" } };
  }
  return tavusFetch(`/conversations/${encodeURIComponent(conversationId)}`, {
    method: "DELETE",
  });
}

// ponytail: self-check invalid-replica detector
if (process.env.TAVUS_RESOLVE_SELF_CHECK === "1") {
  if (
    !isInvalidReplicaError({ error: "Invalid replica_uuid" }) ||
    !isInvalidReplicaError({ error: "Invalid face_id" })
  ) {
    throw new Error("isInvalidReplicaError self-check failed");
  }
}
