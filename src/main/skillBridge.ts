import http from "http";
import { safeError, safeLog, safeWarn } from "./logger";
import { normalizeReplaySteps } from "./session/skillBuilder";
import type { Step } from "./session/types";

export interface SkillBridgeHandlers {
  onPlaySkill: (skillId: string, steps: Step[]) => Promise<void>;
  getRecordingState: () => { active: boolean };
}

const DEFAULT_PORT = 3927;
const MAX_BODY_BYTES = 512_000;
const MAX_REPLAY_STEPS = 80;

const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
]);

function corsOrigin(req: http.IncomingMessage): string | null {
  const origin = req.headers.origin;
  if (!origin) return "http://localhost:5173";
  return ALLOWED_ORIGINS.has(origin) ? origin : null;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  payload: unknown,
  origin: string | null,
): void {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }
  res.writeHead(status, headers);
  res.end(body);
}

export function startSkillBridge(handlers: SkillBridgeHandlers): http.Server {
  const port = Number(process.env.SPECTER_AGENT_PORT) || DEFAULT_PORT;
  const server = http.createServer((req, res) => {
    const origin = corsOrigin(req);

    if (req.method === "OPTIONS") {
      if (!origin) {
        res.writeHead(403).end();
        return;
      }
      res.writeHead(204, {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        Vary: "Origin",
      });
      res.end();
      return;
    }

    void (async () => {
      try {
        const url = req.url || "/";

        if (req.method === "GET" && url === "/health") {
          sendJson(
            res,
            200,
            {
              ok: true,
              recording: handlers.getRecordingState().active,
              service: "specter-skill-bridge",
            },
            origin,
          );
          return;
        }

        if (req.method === "POST" && url === "/play") {
          if (!origin) {
            safeWarn("[skillBridge] blocked /play from disallowed origin", {
              origin: req.headers.origin,
            });
            sendJson(res, 403, { ok: false, error: "Origin not allowed" }, null);
            return;
          }

          const raw = await readBody(req);
          const body = raw ? JSON.parse(raw) : {};
          const skillId =
            typeof body.skillId === "string" ? body.skillId.slice(0, 120) : "unknown-skill";
          const steps = normalizeReplaySteps(body.steps || body.replaySteps).slice(
            0,
            MAX_REPLAY_STEPS,
          );
          if (steps.length === 0) {
            sendJson(
              res,
              400,
              { ok: false, error: "No replay steps provided" },
              origin,
            );
            return;
          }
          await handlers.onPlaySkill(skillId, steps);
          sendJson(res, 200, { ok: true, skillId, steps: steps.length }, origin);
          return;
        }

        sendJson(res, 404, { ok: false, error: "Not found" }, origin);
      } catch (error) {
        safeError("[skillBridge] request failed", { error });
        sendJson(
          res,
          500,
          {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          },
          origin,
        );
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
