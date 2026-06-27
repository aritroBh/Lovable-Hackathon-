export const TILE = 30;
export const COLS = 16;
export const ROWS = 12;

// t=grass p=path g=tall c=center y=gym l=lab
export const MAP = [
  "tttttttttttttttt",
  "tttttttttttttttt",
  "tttttttttttttttt",
  "ttttttgttgtttttt",
  "ttttpppppppppttt",
  "tttppypplppptttt",
  "tttppppppppptttt",
  "tttppgppgppptttt",
  "tttppcpcpppptttt",
  "tttppppppppptttt",
  "tttttttttttttttt",
  "tttttttttttttttt",
] as const;

export type BuildingType = "center" | "gym" | "lab";

export const BUILDINGS: Record<
  string,
  { type: BuildingType; msg: string[] }
> = {
  "5,8": {
    type: "center",
    msg: [
      "Welcome to the POKéMON CENTER!",
      "Your party was healed!",
      "TRAIN with PAL?",
    ],
  },
  "5,5": {
    type: "gym",
    msg: [
      "GYM LEADER blocks the path!",
      "Boss workflow — learn all moves!",
    ],
  },
  "8,5": {
    type: "lab",
    msg: [
      "PROF. SPECTER: Publish skills to catch them!",
      "Ready to catch a learned skill?",
    ],
  },
};

export const START_POS = { x: 7, y: 7 };

const CHAR_TILE: Record<string, string> = {
  t: "grass",
  p: "path",
  g: "tall",
  w: "water",
  c: "building center",
  y: "building gym",
  l: "building lab",
};

export function tileAt(x: number, y: number): string {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return "w";
  return MAP[y]?.[x] ?? "t";
}

export function tileClass(x: number, y: number): string {
  const ch = tileAt(x, y);
  return CHAR_TILE[ch] ?? "grass";
}

export function canWalk(x: number, y: number): boolean {
  const t = tileAt(x, y);
  return t === "p" || t === "g" || t === "c" || t === "y" || t === "l";
}

export function buildingAt(x: number, y: number) {
  return BUILDINGS[`${x},${y}`];
}

// ponytail: self-check
if (import.meta.env.DEV) {
  console.assert(MAP.length === ROWS && MAP[0].length === COLS, "map dims");
}
