/**
 * Live Set-of-Mark grounding smoke test.
 *
 * Draws a synthetic numbered 3-button UI, sends it through the REAL SoM prompt
 * builder + parser to qwen3.5-122b and llama-4-maverick on NVIDIA NIM, and
 * checks each model picks the box matching the target label ("Send" => index 1).
 *
 * Proves end-to-end: keys work, the models accept the image, the SoM prompt
 * elicits the {chosenIndex} JSON, and parseSetOfMarkJson reads it. The Electron
 * capture + AX->pixel mapping are covered by the typecheck, not here.
 *
 * Run: npx ts-node --transpile-only scripts/test-grounding.ts
 */
import "dotenv/config";
import Jimp from "jimp";
import { buildSetOfMarkPrompt } from "../src/main/vision/prompts";
import { parseSetOfMarkJson } from "../src/main/vision/json";

const ENDPOINT =
  process.env.NVIDIA_CHAT_COMPLETIONS_URL ||
  "https://integrate.api.nvidia.com/v1/chat/completions";

const BOXES = [
  { idx: 0, label: "Save", x: 90, y: 90 },
  { idx: 1, label: "Send", x: 90, y: 240 },
  { idx: 2, label: "Cancel", x: 90, y: 390 },
];
const TARGET = "Send";
const EXPECTED_INDEX = 1;
const BOX_W = 180;
const BOX_H = 64;

function fillRect(img: Jimp, x: number, y: number, w: number, h: number, color: number): void {
  img.scan(x, y, w, h, function (_x, _y, i) {
    this.bitmap.data.writeUInt32BE(color >>> 0, i);
  });
}

async function buildImage(): Promise<{ base64: string; width: number; height: number }> {
  const width = 460;
  const height = 520;
  const img = new Jimp(width, height, 0xf4f4f6ff);
  const black = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
  const whiteSmall = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);

  for (const b of BOXES) {
    // button surface + 2px border
    fillRect(img, b.x - 2, b.y - 2, BOX_W + 4, BOX_H + 4, 0x222222ff);
    fillRect(img, b.x, b.y, BOX_W, BOX_H, 0xffffffff);
    img.print(black, b.x + 16, b.y + 16, b.label);
    // set-of-mark numeric tag (red tag, white number) at top-left corner
    fillRect(img, b.x - 2, b.y - 2, 30, 26, 0xd83a3aff);
    img.print(whiteSmall, b.x + 4, b.y + 2, String(b.idx));
  }

  const buf = await img.getBufferAsync(Jimp.MIME_PNG);
  return { base64: buf.toString("base64"), width, height };
}

async function askModel(
  model: string,
  apiKey: string,
  imageBase64: string,
  width: number,
  height: number,
): Promise<{ chosenIndex: number | null; confidence?: number; raw: string }> {
  const legend = BOXES.map((b) => `[${b.idx}] ${b.label} button`).join("; ");
  const userPrompt = `Numbered candidate UI elements: ${legend}. Target to find: "${TARGET}".`;
  const prompt = buildSetOfMarkPrompt(userPrompt, "synthetic test UI", width, height);

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:image/png;base64,${imageBase64}` } },
          ],
        },
      ],
      max_tokens: 512,
      temperature: 0.1,
      top_p: 1,
      stream: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${model} HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  const data: any = await res.json();
  const raw: string = data.choices?.[0]?.message?.content ?? "";
  const parsed = parseSetOfMarkJson(raw);
  return { chosenIndex: parsed?.chosenIndex ?? null, confidence: parsed?.confidence, raw };
}

async function main(): Promise<void> {
  const qwenKey = process.env.GHOST_GROUNDING_API_KEY || process.env.NVIDIA_API_KEY;
  const qwenModel = process.env.GHOST_GROUNDING_MODEL || "qwen/qwen3.5-122b-a10b";
  const mavKey = process.env.NVIDIA_API_KEY_MAVERICK || process.env.NVIDIA_API_KEY;
  const mavModel = process.env.NVIDIA_VISION_MODEL || "meta/llama-4-maverick-17b-128e-instruct";

  if (!qwenKey || !mavKey) {
    throw new Error("Missing NVIDIA keys in .env");
  }

  const { base64, width, height } = await buildImage();
  console.log(`Image: ${width}x${height}, target="${TARGET}" expect index ${EXPECTED_INDEX}\n`);

  const results: { model: string; ok: boolean; idx: number | null }[] = [];
  for (const [name, model, key] of [
    ["qwen3.5-122b", qwenModel, qwenKey],
    ["maverick", mavModel, mavKey],
  ] as const) {
    try {
      const r = await askModel(model, key, base64, width, height);
      const ok = r.chosenIndex === EXPECTED_INDEX;
      results.push({ model: name, ok, idx: r.chosenIndex });
      console.log(
        `${ok ? "PASS" : "FAIL"} ${name}: chosenIndex=${r.chosenIndex} conf=${r.confidence ?? "?"}`,
      );
      console.log(`     raw: ${r.raw.replace(/\s+/g, " ").slice(0, 160)}\n`);
    } catch (e: any) {
      results.push({ model: name, ok: false, idx: null });
      console.log(`ERROR ${name}: ${e.message}\n`);
    }
  }

  // Primary gate: qwen (the chosen grounding model) must pick correctly.
  const qwen = results.find((r) => r.model === "qwen3.5-122b");
  if (!qwen?.ok) {
    console.error("VERIFY FAILED: qwen3.5 did not pick the Set-of-Mark target.");
    process.exit(1);
  }
  console.log("VERIFY OK: qwen3.5 Set-of-Mark grounding works end-to-end.");
}

main().catch((e) => {
  console.error("VERIFY ERROR:", e.message);
  process.exit(1);
});
