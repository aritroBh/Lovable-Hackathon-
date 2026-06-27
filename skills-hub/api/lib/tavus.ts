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
