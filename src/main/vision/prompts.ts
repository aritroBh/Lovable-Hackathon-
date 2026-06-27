import { VisionTask } from "./types";

/**
 * Set-of-Mark grounding prompt. The screenshot has numbered boxes drawn over
 * candidate UI elements; the legend (index -> label/role) is passed via
 * `userPrompt`. The model must return ONLY the index of the box that matches the
 * target — never a pixel coordinate (general VLMs score <2% at coordinate
 * regression; multiple-choice "pick a box" is the reliable path).
 */
export function buildSetOfMarkPrompt(
  userPrompt?: string,
  appContext?: string,
  width?: number,
  height?: number,
): string {
  const dimensions =
    width && height ? `\nImage dimensions: ${width}x${height} pixels.` : "";
  const legend = userPrompt
    ? `\n\nCandidates (each number is a labeled box drawn on the screenshot):\n${userPrompt}`
    : "";
  const appCtx = appContext ? `\n\nApp context: ${appContext}` : "";

  return `You are the visual grounding layer for Specter, a desktop automation assistant.
The screenshot has numbered boxes drawn over candidate UI elements.${dimensions}
Each number identifies one candidate control. Pick the single box that best matches the target the user wants to act on.

Return ONLY valid JSON.
Do not use markdown.
Do not include commentary.
Do not include code fences.

Return this exact JSON shape:

{ "chosenIndex": <integer>, "confidence": <number 0..1>, "reasoning": "<one short sentence>" }

Rules:
- chosenIndex MUST be one of the numbers drawn on the screenshot.
- If none of the numbered boxes match the target, return chosenIndex = -1.
- Do NOT output pixel coordinates, bounding boxes, or any other fields.
- Use both the drawn numbers AND the candidate legend below to decide.
- Keep reasoning to one short sentence.${legend}${appCtx}`;
}

export function buildVisionPrompt(
  task: VisionTask,
  userPrompt?: string,
  appContext?: string,
  width?: number,
  height?: number,
): string {
  if (task === "set_of_mark") {
    return buildSetOfMarkPrompt(userPrompt, appContext, width, height);
  }

  const dimensions =
    width && height ? `\nImage dimensions: ${width}x${height} pixels.` : "";
  const basePrompt = `You are the vision layer for Specter, a desktop automation assistant.
Analyze the screenshot and identify visible UI elements.${dimensions}
Return ONLY valid JSON.
Do not use markdown.
Do not include commentary.
Do not include code fences.

Return this exact JSON shape:

{
  "summary": "short description of what is visible",
  "elements": [
    {
      "label": "human readable element label",
      "type": "button | input | menu | dialog | text | icon | window | tab | checkbox | toggle | unknown",
      "text": "visible text if any",
      "confidence": 0.0,
      "bbox": { "x": 0, "y": 0, "width": 0, "height": 0 },
      "center": { "x": 0, "y": 0 },
      "reasoning": "brief reason for identifying this element"
    }
  ],
  "recommendedAction": "safe next action, if any",
  "warnings": []
}

Coordinate rules:
- Coordinates MUST be pixels based on the original image dimensions.
- x/y origin (0,0) is the top-left of the screenshot.
- bbox must tightly approximate the visible UI element in pixels.
- center must be the center of bbox in pixels.
- If unsure about exact coordinates, lower confidence and add a warning.
- Do not invent precise coordinates for invisible elements.
- Prefer identifying visible buttons, input boxes, dialogs, permission prompts, app windows, menus, toggles, and targetable controls.
- If there is a system permission dialog, identify the exact buttons and visible permission names.
- If the screenshot contains sensitive information, include a privacy warning.
- If the Specter overlay is visible, mention it but do not use it as the target unless asked.
- If a target cannot be found, say so in warnings.`;

  let taskSpecific = "";

  switch (task) {
    case "target_detection":
      taskSpecific = `\n\nFor target_detection:
- Prioritize clickable controls.
- Include likely target center coordinates in screenshot pixels.
- Add confidence.
- Warn if the target is ambiguous.`;
      break;
    case "walkthrough_planning":
      taskSpecific = `\n\nFor walkthrough_planning:
- Identify the next visible control the user should click.
- Do not output more than 5 recommended elements unless needed.
- Do not pretend an action was completed.`;
      break;
    case "permission_dialog_detection":
      taskSpecific = `\n\nFor permission_dialog_detection:
- Identify which permission appears missing.
- Identify whether the visible System Settings pane is Accessibility, Input Monitoring, or Screen Recording.
- Identify whether Electron is enabled if visible.
- Recommend Retry only if required permissions appear enabled.`;
      break;
    default:
      break;
  }

  const userContext = userPrompt ? `\n\nUser request: ${userPrompt}` : "";
  const appCtx = appContext ? `\n\nApp context: ${appContext}` : "";

  return `${basePrompt}${taskSpecific}${userContext}${appCtx}`;
}
