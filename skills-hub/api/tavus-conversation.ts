import type { VercelRequest, VercelResponse } from "@vercel/node";
import { loadAllSkills } from "./lib/store";
import { createTavusConversation, resolveReplicaId } from "./lib/tavus";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const source =
    typeof req.body?.source === "string" ? req.body.source : "hub";
  const skillId = typeof req.body?.skillId === "string" ? req.body.skillId : "";
  const userId =
    typeof req.body?.userId === "string" ? req.body.userId : "specter-demo";
  const movesLearned =
    typeof req.body?.movesLearned === "number" ? req.body.movesLearned : null;
  const memoryContext =
    typeof req.body?.memoryContext === "string" ? req.body.memoryContext : "";
  const clientReplicaId =
    typeof req.body?.replicaId === "string" ? req.body.replicaId : null;
  const clientReplicaReady = req.body?.replicaReady === true;

  const apiKey = process.env.TAVUS_API_KEY;
  const personaId = process.env.TAVUS_PERSONA_ID;
  const envReplicaId = process.env.TAVUS_REPLICA_ID;

  if (!apiKey || !personaId) {
    return res.status(503).json({
      ok: false,
      error: "Missing Tavus env",
    });
  }

  const resolvedReplicaId = resolveReplicaId({
    clientReplicaId,
    clientReplicaReady,
    envReplicaId,
  });

  const properties: Record<string, unknown> = {
    max_call_duration: 300,
    language: "english",
    participant_absent_timeout: 300,
    participant_left_timeout: 60,
    enable_closed_captions: true,
  };

  let conversational_context: string;
  let conversation_name: string;
  let custom_greeting: string;

  if (source === "overlay") {
    const ctx = memoryContext.trim()
      ? memoryContext.slice(0, 2800)
      : "No prior session memory loaded.";
    conversational_context = `You are Specter — the user's sidekick PAL on their Mac.\n\nTeach from what they know. Be warm, direct, one step at a time.\n\nSession memory:\n${ctx}`;
    conversation_name = "Specter overlay";
    custom_greeting = "Hey — I'm Specter. What should we work on?";
  } else {
    const skill = loadAllSkills().find((s) => s.id === skillId);
    if (!skill) {
      return res.status(404).json({ ok: false, error: "Skill not found" });
    }
    const progress =
      movesLearned != null
        ? `\nUser already knows ${movesLearned} of ${skill.steps?.length || "?"} moves. Continue from there.`
        : "";
    conversational_context = `You are Specter, a sidekick PAL teaching this published skill.\n\nSkill: ${skill.title}\n\n${skill.contextBody}\n\nTeach step by step. Ask before acting. Remember prior sessions with this user.${progress}`;
    conversation_name = `Specter: ${skill.title}`;
    custom_greeting = `Hey — ready to walk through "${skill.title}"?`;
  }

  const body: Record<string, unknown> = {
    pal_id: personaId,
    conversation_name,
    conversational_context,
    custom_greeting,
    memory_stores: [userId],
    max_participants: 2,
    properties,
  };
  if (resolvedReplicaId) body.face_id = resolvedReplicaId;
  const callbackUrl = process.env.TAVUS_CALLBACK_URL;
  if (callbackUrl) body.callback_url = callbackUrl;

  try {
    const result = await createTavusConversation(body, {
      resolvedReplicaId,
      envReplicaId,
      clientReplicaReady,
    });
    if (!result.ok) {
      return res.status(result.status).json({ ok: false, error: result.data });
    }
    const data = result.data;
    return res.status(200).json({
      ok: true,
      conversation_url: data.conversation_url,
      conversation_id: data.conversation_id,
      replica_id: result.replica_id,
      using_custom_replica: Boolean(
        clientReplicaId && clientReplicaReady && result.replica_id === clientReplicaId,
      ),
    });
  } catch (e) {
    return res.status(502).json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
