import {
  VisionProvider,
  VisionAnalyzeInput,
  VisionAnalyzeResult,
} from "./types";
import { VisionProviderError } from "./errors";

/**
 * Deterministically choose a Set-of-Mark index from the request so the SoM
 * pipeline is unit-testable without a live model.
 *
 * Resolution order (first match wins):
 *   1. an explicit `chosenIndex=<n>` marker embedded in `userPrompt`
 *      (e.g. the legend line "chosenIndex=2"),
 *   2. env `MOCK_SOM_CHOSEN_INDEX`,
 *   3. the lowest numeric index found in the legend (lines like "2 -> Save"),
 *   4. fallback 0.
 */
function deterministicChosenIndex(userPrompt?: string): number {
  const prompt = userPrompt ?? "";

  const marker = prompt.match(/chosenIndex\s*=\s*(-?\d+)/i);
  if (marker) return parseInt(marker[1], 10);

  const envOverride = process.env.MOCK_SOM_CHOSEN_INDEX;
  if (envOverride !== undefined && /^-?\d+$/.test(envOverride.trim())) {
    return parseInt(envOverride.trim(), 10);
  }

  // Legend lines look like "<index> -> <label> (<role>)"; pick the smallest index.
  const indices: number[] = [];
  const lineRegex = /^\s*(\d+)\s*(?:->|:|\.)/gm;
  let match: RegExpExecArray | null;
  while ((match = lineRegex.exec(prompt)) !== null) {
    indices.push(parseInt(match[1], 10));
  }
  if (indices.length > 0) return Math.min(...indices);

  return 0;
}

export class MockVisionProvider implements VisionProvider {
  public name = "mock" as const;

  async analyze(input: VisionAnalyzeInput): Promise<VisionAnalyzeResult> {
    const isAllowed =
      process.env.NODE_ENV !== "production" || process.env.DEMO_MODE === "true";

    if (!isAllowed) {
      throw new VisionProviderError(
        "VISION_PROVIDER_NOT_ALLOWED",
        this.name,
        "Mock vision provider is not allowed in production unless DEMO_MODE is true.",
      );
    }

    if (input.task === "set_of_mark") {
      const chosenIndex = deterministicChosenIndex(input.userPrompt);
      const confidence = chosenIndex < 0 ? 0 : 0.9;
      const rawText = JSON.stringify({
        chosenIndex,
        confidence,
        reasoning: "Mock deterministic Set-of-Mark choice",
      });

      return {
        provider: this.name,
        model: input.model || "mock-vision-v1",
        generatedAt: new Date().toISOString(),
        latencyMs: 5,
        summary: `Mock set_of_mark choice: ${chosenIndex}`,
        // SoM grounding reads chosenIndex out of rawText, so it must carry the JSON.
        elements: [],
        warnings: ["This is a mock SoM response"],
        rawText,
      };
    }

    return {
      provider: this.name,
      model: input.model || "mock-vision-v1",
      generatedAt: new Date().toISOString(),
      latencyMs: 150,
      summary: `Mock analysis for task: ${input.task}`,
      elements: [
        {
          label: "Mock Button",
          type: "button",
          text: "Click Me",
          confidence: 0.95,
          bbox: { x: 100, y: 100, width: 80, height: 30 },
          center: { x: 140, y: 115 },
          reasoning: "Mock element for development",
        },
      ],
      recommendedAction: "Click the mock button",
      warnings: ["This is a mock response"],
    };
  }
}
