const AGENT_URL =
  import.meta.env.VITE_SPECTER_AGENT_URL || "http://127.0.0.1:3927";

export async function isSpecterAgentOnline(): Promise<boolean> {
  try {
    const res = await fetch(`${AGENT_URL}/health`, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function playSkillOnMac(
  skillId: string,
  replaySteps: unknown[],
): Promise<void> {
  const res = await fetch(`${AGENT_URL}/play`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ skillId, replaySteps }),
  });
  const raw = await res.text();
  let data: { ok?: boolean; error?: string };
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(
      "Specter is not running — launch Specter on this Mac, then try again.",
    );
  }
  if (!res.ok || !data.ok) {
    throw new Error(
      data.error ||
        (!raw.trim()
          ? "Specter is not running — launch Specter on this Mac, then try again."
          : `Ghost walkthrough failed (${res.status})`),
    );
  }
}
