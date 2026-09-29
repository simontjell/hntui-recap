import { Effect, Layer } from "effect"
import { RecapTransport } from "./recap"
import type { RecapTransportShape } from "./recap"

// Demo transport: no web page is fetched and Claude is never called. Every
// story gets the same canned recap, streamed word by word so the UI's
// streaming path is exercised. Selected with HN_DEMO=1 (see src/runtime.ts).

const DEMO_RECAP = `[SIMULATED RECAP] This is what a Claude recap looks like: a short paragraph that says what the article is about and what it claims, followed by the points worth knowing before you decide whether to read the whole thing.

• Recaps stream in as they are generated, so the first words show up right away.
• Finished recaps are cached per story, so reopening a post is instant and free.
• Press c to switch to the comments, and c again to come back.
• Press r to throw this recap away and ask Claude for a fresh one.`

export const RecapTransportDemo = Layer.succeed(RecapTransport, {
  // long enough to count as a real article (see MIN_PAGE_CHARS in recap.ts)
  fetchPage: () => Effect.succeed(`<article><p>${"Demo article text. ".repeat(20)}</p></article>`),
  summarize: (source, onDelta) =>
    Effect.gen(function* () {
      const words = DEMO_RECAP.split(/(?<=\s)/)
      let out = ""
      for (const w of words) {
        out += w
        onDelta(out)
        yield* Effect.sleep("30 millis")
      }
      return { text: out, model: "demo" }
    }),
} satisfies RecapTransportShape)
