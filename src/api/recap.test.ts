import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import {
  RecapApiError,
  RecapApiLive,
  RecapFetchError,
  RecapStoreMemory,
  RecapTransport,
  recap,
} from "./recap"
import type { RecapSource, RecapTransportShape } from "./recap"
import type { Item } from "./types"

// A transport made of canned pages and a fake Claude. The REAL RecapApiLive
// layer — source selection, streaming handoff, the cache — runs on top of it.
interface Fake {
  pages: Record<string, string>
  fetched: string[]
  summarized: RecapSource[]
  reply?: (s: RecapSource) => string
}

const fake = (pages: Record<string, string>, reply?: Fake["reply"]): Fake => ({
  pages,
  fetched: [],
  summarized: [],
  reply,
})

const apiWith = (f: Fake) =>
  RecapApiLive.pipe(
    Layer.provide(
      Layer.merge(
        RecapStoreMemory,
        Layer.succeed(RecapTransport, {
          fetchPage: (url) =>
            Effect.suspend(() => {
              f.fetched.push(url)
              const html = f.pages[url]
              return html === undefined
                ? Effect.fail(new RecapFetchError({ url, reason: "status", detail: "404" }))
                : Effect.succeed(html)
            }),
          summarize: (source, onDelta) =>
            Effect.sync(() => {
              f.summarized.push(source)
              const text = (f.reply ?? (() => `recap of ${source.title}`))(source)
              onDelta(text.slice(0, 3))
              onDelta(text)
              return { text, model: "fake-model" }
            }),
        } satisfies RecapTransportShape),
      ),
    ),
  )

const LONG_BODY = "Lorem ipsum dolor sit amet. ".repeat(20)
const PAGES = {
  "https://example.com/a": `<html><head><title>Page A</title></head><body><nav>menu</nav><article><p>${LONG_BODY}</p></article></body></html>`,
  "https://example.com/shell": `<html><body><div id="root"></div></body></html>`,
}

const story = (over: Partial<Item>): Item => ({ id: 1, type: "story", title: "A story", ...over })

const run = <A, E>(eff: Effect.Effect<A, E, any>, layer: Layer.Layer<any>) =>
  Effect.runPromise(Effect.provide(eff, layer))

describe("recap (hermetic, via test transport layer)", () => {
  test("a linked story sends the page text to Claude and streams partials back", async () => {
    const f = fake(PAGES)
    const partials: string[] = []
    const text = await run(
      recap(story({ url: "https://example.com/a" }), { onDelta: (p) => partials.push(p) }),
      apiWith(f),
    )
    expect(text).toBe("recap of A story (Page A)")
    expect(partials).toEqual(["rec", "recap of A story (Page A)"])
    expect(f.summarized).toHaveLength(1)
    expect(f.summarized[0]!.url).toBe("https://example.com/a")
    expect(f.summarized[0]!.text).toContain("Lorem ipsum")
    expect(f.summarized[0]!.text).not.toContain("menu")
  })

  test("a text-only post (Ask HN) recaps its own text without fetching", async () => {
    const f = fake(PAGES)
    await run(
      recap(story({ text: "Ask HN: what <i>editor</i> do you use?" }), { onDelta: () => {} }),
      apiWith(f),
    )
    expect(f.fetched).toEqual([])
    expect(f.summarized[0]!.text).toBe("Ask HN: what editor do you use?")
    expect(f.summarized[0]!.url).toBeUndefined()
  })

  test("a page with no readable text falls back to the post text", async () => {
    const f = fake(PAGES)
    await run(
      recap(story({ url: "https://example.com/shell", text: "Show HN: my thing" }), {
        onDelta: () => {},
      }),
      apiWith(f),
    )
    expect(f.summarized[0]!.text).toBe("Show HN: my thing")
  })

  test("a page with no readable text and no post text fails with RecapNoContent", async () => {
    const e = await run(
      Effect.flip(recap(story({ url: "https://example.com/shell" }), { onDelta: () => {} })),
      apiWith(fake(PAGES)),
    )
    expect(e._tag).toBe("RecapNoContent")
  })

  test("a story with neither url nor text fails with RecapNoContent", async () => {
    const e = await run(
      Effect.flip(recap(story({}), { onDelta: () => {} })),
      apiWith(fake(PAGES)),
    )
    expect(e._tag).toBe("RecapNoContent")
  })

  test("a page that can't be fetched fails with RecapFetchError", async () => {
    const e = await run(
      Effect.flip(recap(story({ url: "https://example.com/missing" }), { onDelta: () => {} })),
      apiWith(fake(PAGES)),
    )
    expect(e._tag).toBe("RecapFetchError")
  })

  test("Claude errors pass through as RecapApiError", async () => {
    const layer = RecapApiLive.pipe(
      Layer.provide(
        Layer.merge(
          RecapStoreMemory,
          Layer.succeed(RecapTransport, {
            fetchPage: () => Effect.succeed(PAGES["https://example.com/a"]),
            summarize: () => Effect.fail(new RecapApiError({ kind: "auth", message: "nope" })),
          }),
        ),
      ),
    )
    const e = await run(
      Effect.flip(recap(story({ url: "https://example.com/a" }), { onDelta: () => {} })),
      layer,
    )
    expect(e._tag).toBe("RecapApiError")
    expect((e as RecapApiError).kind).toBe("auth")
  })

  test("a second recap of the same story is served from the cache", async () => {
    const f = fake(PAGES)
    const layer = apiWith(f)
    const s = story({ url: "https://example.com/a" })
    const program = Effect.gen(function* () {
      const a = yield* recap(s, { onDelta: () => {} })
      const partials: string[] = []
      const b = yield* recap(s, { onDelta: (p) => partials.push(p) })
      return { a, b, partials }
    })
    const { a, b, partials } = await run(program, layer)
    expect(a).toBe(b)
    expect(partials).toEqual([a])
    expect(f.fetched).toHaveLength(1)
    expect(f.summarized).toHaveLength(1)
  })

  test("fresh: true skips the cache and asks again", async () => {
    let n = 0
    const f = fake(PAGES, () => `recap #${++n}`)
    const layer = apiWith(f)
    const s = story({ url: "https://example.com/a" })
    const program = Effect.gen(function* () {
      const a = yield* recap(s, { onDelta: () => {} })
      const b = yield* recap(s, { onDelta: () => {}, fresh: true })
      const c = yield* recap(s, { onDelta: () => {} })
      return [a, b, c]
    })
    expect(await run(program, layer)).toEqual(["recap #1", "recap #2", "recap #2"])
    expect(f.summarized).toHaveLength(2)
  })
})
