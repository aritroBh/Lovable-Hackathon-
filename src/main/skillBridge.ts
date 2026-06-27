import http from "http";
import { safeError, safeLog } from "./logger";
import { normalizeReplaySteps } from "./session/skillBuilder";
import type { Step } from "./session/types";

export interface SkillBridgeHandlers {
  onToggleRecord: () => Promise<unknown>;
  onPlaySkill: (skillId: string, steps: Step[]) => Promise<void>;
  getRecordingState: () => { active: boolean };
}

const DEFAULT_PORT = 3927;

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  payload: unknown,
): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(body);
}

export function startSkillBridge(handlers: SkillBridgeHandlers): http.Server {
  const port = Number(process.env.SPECTER_AGENT_PORT) || DEFAULT_PORT;
  const server = http.createServer((req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }

    void (async () => {
      try {
        const url = req.url || "/";

        if (req.method === "GET" && url === "/health") {
          sendJson(res, 200, {
            ok: true,
            recording: handlers.getRecordingState().active,
            service: "specter-skill-bridge",
          });
          return;
        }

        if (req.method === "POST" && url === "/record/toggle") {
          const result = await handlers.onToggleRecord();
          sendJson(res, 200, { ok: true, result });
          return;
        }

        if (req.method === "POST" && url === "/play") {
          const raw = await readBody(req);
          const body = raw ? JSON.parse(raw) : {};
          const skillId =
            typeof body.skillId === "string" ? body.skillId : "unknown-skill";
          const steps = normalizeReplaySteps(body.steps || body.replaySteps);
          if (steps.length === 0) {
            sendJson(res, 400, {
              ok: false,
              error: "No replay steps provided",
            });
            return;
          }
          await handlers.onPlaySkill(skillId, steps);
          sendJson(res, 200, { ok: true, skillId, steps: steps.length });
          return;
        }

        sendJson(res, 404, { ok: false, error: "Not found" });
      } catch (error) {
        safeError("[skillBridge] request failed", { error });
        sendJson(res, 500, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  });

  server.listen(port, "127.0.0.1", () => {
    safeLog("[skillBridge] listening", { port });
  });

  server.on("error", (error) => {
    safeError("[skillBridge] server error", { error });
  });

  return server;
}
