import crypto from "node:crypto";

/**
 * Curated neutral, human-readable codename vocabulary.
 * Kept free of institution/participant hints and easy to read aloud during judging.
 */
export const CODENAME_ADJECTIVES = [
  "AMBER",
  "ARCTIC",
  "AZURE",
  "BOLD",
  "BRIGHT",
  "BRISK",
  "BRONZE",
  "CALM",
  "CEDAR",
  "CLEAR",
  "COBALT",
  "CORAL",
  "CRISP",
  "DAWN",
  "DEEP",
  "DELTA",
  "DUSK",
  "EMBER",
  "EMERALD",
  "FAIR",
  "FIRM",
  "FROST",
  "GOLD",
  "GRAND",
  "GRANITE",
  "HARBOR",
  "IVORY",
  "JADE",
  "KEEN",
  "LUNAR",
  "MAPLE",
  "MEADOW",
  "MINT",
  "MIST",
  "NOBLE",
  "NORTH",
  "OCHRE",
  "OLIVE",
  "OPAL",
  "PEARL",
  "PINE",
  "QUARTZ",
  "QUIET",
  "RAPID",
  "RIVER",
  "ROYAL",
  "SAGE",
  "SILVER",
  "SOLAR",
  "STEADY",
  "STERLING",
  "STONE",
  "SWIFT",
  "TERRA",
  "TIMBER",
  "VERDANT",
] as const;

export const CODENAME_NOUNS = [
  "ALPINE",
  "ANCHOR",
  "ARROW",
  "ATLAS",
  "AURORA",
  "BADGER",
  "BEACON",
  "BISON",
  "BRIDGE",
  "CANYON",
  "COMET",
  "COMPASS",
  "CONDOR",
  "CREST",
  "CYPRESS",
  "DOLPHIN",
  "EAGLE",
  "ECHO",
  "FALCON",
  "FINCH",
  "FJORD",
  "FLINT",
  "FOREST",
  "GALAXY",
  "GAZELLE",
  "GLACIER",
  "GRIFFIN",
  "HARVEST",
  "HAWK",
  "HERON",
  "HORIZON",
  "ISLAND",
  "KESTREL",
  "LANTERN",
  "LARK",
  "LAUREL",
  "LYNX",
  "MARLIN",
  "MERIDIAN",
  "MONARCH",
  "NEBULA",
  "ORBIT",
  "ORCHARD",
  "OSPREY",
  "OTTER",
  "PANTHER",
  "PEAK",
  "PHOENIX",
  "PRISM",
  "PULSE",
  "RAVEN",
  "RIDGE",
  "SPARK",
  "SPARROW",
  "SUMMIT",
  "VECTOR",
] as const;

// Avoids 0 and 1 to prevent O/0 and I/1 read-aloud ambiguity
const UNAMBIGUOUS_DIGITS = ["2", "3", "4", "5", "6", "7", "8", "9"] as const;
const FALLBACK_ALPHANUM = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function randomPick<T>(items: readonly T[]): T {
  return items[crypto.randomInt(0, items.length)];
}

function randomNounExcluding(adjective: string): string {
  for (let i = 0; i < 20; i += 1) {
    const noun = randomPick(CODENAME_NOUNS);
    if (noun !== adjective) return noun;
  }
  return CODENAME_NOUNS.find((n) => n !== adjective) ?? CODENAME_NOUNS[0];
}

export function generateCandidateCodename(): string {
  const adj = randomPick(CODENAME_ADJECTIVES);
  const noun = randomNounExcluding(adj);
  const d1 = randomPick(UNAMBIGUOUS_DIGITS);
  const d2 = randomPick(UNAMBIGUOUS_DIGITS);
  return `${adj}-${noun}-${d1}${d2}`;
}

export function generateFallbackCodename(): string {
  const adj = randomPick(CODENAME_ADJECTIVES);
  const noun = randomNounExcluding(adj);
  let suffix = "";
  for (let i = 0; i < 4; i += 1) {
    suffix += FALLBACK_ALPHANUM[crypto.randomInt(0, FALLBACK_ALPHANUM.length)];
  }
  return `${adj}-${noun}-${suffix}`;
}

/**
 * Generates an anonymous, human-readable codename guaranteed not to exist in
 * `existingUpperSet`, handling random collisions safely.
 */
export function generateUniqueCodename(
  existingUpperSet: ReadonlySet<string>,
  maxPrimaryAttempts = 200,
): string {
  for (let i = 0; i < maxPrimaryAttempts; i += 1) {
    const candidate = generateCandidateCodename();
    if (!existingUpperSet.has(candidate)) {
      return candidate;
    }
  }

  for (let i = 0; i < 200; i += 1) {
    const candidate = generateFallbackCodename();
    if (!existingUpperSet.has(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    "Unable to generate a unique codename after maximum collision retries.",
  );
}
