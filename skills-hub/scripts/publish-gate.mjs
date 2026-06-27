/** ponytail: mirror of publishGate in src/journey.ts — keep in sync */
export function publishGate(userId, stored, seedAuthor) {
  if (!stored) return "No journey progress for this skill";
  if (stored.origin === "hub_trainer") return "Trainer skills cannot be published";
  const learned =
    stored.state === "learned" ||
    stored.state === "caught" ||
    stored.movesLearned >= stored.totalMoves;
  if (!learned) return "Must learn skill before publish";
  if (seedAuthor && seedAuthor !== userId && stored.origin !== "mac") {
    return "Cannot publish another author's skill";
  }
  if (stored.origin !== "mac" && stored.origin !== "hub_self") {
    return "Invalid origin for publish";
  }
  return null;
}

// ponytail: self-check when run directly (not when imported by dev-api-server)
import { fileURLToPath } from "node:url";
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const mac = {
    state: "learned",
    movesLearned: 11,
    totalMoves: 11,
    origin: "mac",
  };
  if (publishGate("u", mac, "Specter") !== null) throw new Error("mac should pass");
  if (publishGate("u", { ...mac, origin: "hub_trainer" }, "Specter") === null) {
    throw new Error("trainer should fail");
  }
  if (publishGate("u", { ...mac, origin: "hub_self" }, "Specter") === null) {
    throw new Error("hub_self on seed should fail");
  }
  console.log("OK publish-gate self-check");
}
