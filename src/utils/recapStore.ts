import { join } from "path"
import { mkdirSync } from "fs"
import { configDir } from "./configDir"

// Recaps cost an API call each, so finished ones are kept on disk keyed by
// story id. Best-effort like the other stores: a missing or corrupt file is
// just an empty cache.

export interface RecapEntry {
  id: number
  text: string
  model: string
  at: number
}

const RECAPS_PATH = join(configDir(), "recaps.json")
const RECAP_CAP = 300

export async function loadRecaps(): Promise<RecapEntry[]> {
  try {
    const file = Bun.file(RECAPS_PATH)
    if (!(await file.exists())) return []
    const data = await file.json()
    if (!Array.isArray(data)) return []
    return data.filter(
      (e): e is RecapEntry =>
        e &&
        typeof e.id === "number" &&
        typeof e.text === "string" &&
        typeof e.model === "string" &&
        typeof e.at === "number",
    )
  } catch {
    return []
  }
}

// Newest first, capped, so the file never grows without bound.
export function withRecap(entries: RecapEntry[], entry: RecapEntry): RecapEntry[] {
  return [entry, ...entries.filter((e) => e.id !== entry.id)].slice(0, RECAP_CAP)
}

export async function persistRecaps(entries: RecapEntry[]): Promise<void> {
  try {
    mkdirSync(configDir(), { recursive: true })
    await Bun.write(RECAPS_PATH, JSON.stringify(entries, null, 2))
  } catch {
    // fail silently — the cache is a convenience, not state
  }
}
