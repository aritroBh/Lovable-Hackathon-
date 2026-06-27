import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { safeLog, safeError } from "./logger";

const DEFAULT_WIKI_ROOT = "./demo-workflows/event-recap/wiki";

function resolvePythonExec(): string {
  if (process.env.VIRTUAL_ENV) {
    return join(process.env.VIRTUAL_ENV, "bin", "python");
  }
  // ponytail: auto-use project venv when present (see docs/SETUP_PIPELINE.md)
  const localVenv = join(process.cwd(), ".venv", "bin", "python");
  if (existsSync(localVenv)) return localVenv;
  return "python3";
}

export function startMemorySidecar() {
  const port = process.env.MEMORY_SERVICE_PORT || "8765";
  const wikiRoot = process.env.GHOSTWIKI_WIKI_ROOT || DEFAULT_WIKI_ROOT;
  const pythonExec = resolvePythonExec();

  safeLog("[GhostWiki] Starting memory sidecar on port", {
    port,
    pythonExec,
    wikiRoot,
  });

  const child = spawn(
    pythonExec,
    [
      "-m",
      "uvicorn",
      "memory_service.app:app",
      "--host",
      "127.0.0.1",
      "--port",
      port,
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PYTHONPATH: process.cwd(),
        GHOSTWIKI_WIKI_ROOT: wikiRoot,
      },
    },
  );

  child.stdout.on("data", (data) => {
    safeLog("[MemoryService]", { out: data.toString().trim() });
  });

  child.stderr.on("data", (data) => {
    safeError("[MemoryService]", { err: data.toString().trim() });
  });

  child.on("close", (code) => {
    safeLog(`[MemoryService] Exited with code ${code}`);
  });

  return child;
}
