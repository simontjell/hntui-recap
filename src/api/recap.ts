import { mkdirSync } from "fs"
import { Context, Data, Effect, Layer } from "effect"
import type { Item } from "./types"
import { articleText, pageTitle } from "../utils/article"
import { htmlToText } from "../utils/format"
import { configDir } from "../utils/configDir"
import { loadRecaps, persistRecaps, withRecap } from "../utils/recapStore"
import type { RecapEntry } from "../utils/recapStore"

// ---------------------------------------------------------------------------
// Errors — every way a recap can fail, as its own named type.
// ---------------------------------------------------------------------------

export class RecapFetchError extends Data.TaggedError("RecapFetchError")<{
  readonly url: string
  readonly reason: "request" | "status" | "timeout" | "unsupported"
  readonly detail?: string
}> {}

// Nothing to recap: no URL and no text, or a page with no readable text.
export class RecapNoContent extends Data.TaggedError("RecapNoContent")<{
  readonly id: number
}> {}

export class RecapApiError extends Data.TaggedError("RecapApiError")<{
  // missing: no `claude` on PATH · auth: not logged in · refused: declined for policy
  readonly kind: "missing" | "auth" | "refused" | "other"
  readonly message: string
}> {}

export type RecapError = RecapFetchError | RecapNoContent | RecapApiError

// ---------------------------------------------------------------------------
// RecapTransport — the two outside contacts: the article's web page, and
// Claude. Swapping this layer swaps both (live / demo / test).
// ---------------------------------------------------------------------------

export interface RecapSource {
  readonly title: string
  readonly url?: string
  readonly text: string
}

export interface RecapResult {
  readonly text: string
  readonly model: string
}

export interface RecapTransportShape {
  readonly fetchPage: (url: string) => Effect.Effect<string, RecapFetchError>
  // `onDelta` receives the full text so far, every time more arrives
  readonly summarize: (
    source: RecapSource,
    onDelta: (partial: string) => void,
  ) => Effect.Effect<RecapResult, RecapApiError>
}

export class RecapTransport extends Context.Tag("RecapTransport")<
  RecapTransport,
  RecapTransportShape
>() {}

// Where finished recaps are kept between runs.
export interface RecapStoreShape {
  readonly load: Effect.Effect<RecapEntry[]>
  readonly save: (entries: RecapEntry[]) => Effect.Effect<void>
}

export class RecapStore extends Context.Tag("RecapStore")<RecapStore, RecapStoreShape>() {}

export const RecapStoreLive = Layer.succeed(RecapStore, {
  load: Effect.promise(() => loadRecaps()),
  save: (entries) => Effect.promise(() => persistRecaps(entries)),
})

export const RecapStoreMemory = Layer.sync(RecapStore, () => {
  let entries: RecapEntry[] = []
  return {
    load: Effect.sync(() => entries),
    save: (next) =>
      Effect.sync(() => {
        entries = next
      }),
  }
})

// ---------------------------------------------------------------------------
// Live transport
// ---------------------------------------------------------------------------

// Recaps are written by Claude Code itself (`claude -p`), so they run on the
// same login as the `claude` command — no API key. Everything that makes an
// interactive session heavy (settings, plugins, MCP servers, slash commands,
// tools, session files) is switched off: the call is one prompt, one answer.
export const RECAP_MODEL = "opus"

const SYSTEM_PROMPT = `You write recaps of web articles for a Hacker News reader in a terminal.

Reply in plain text only: no markdown headings, no bold or italics, no tables, no code fences.

Structure:
- One paragraph of 2-4 sentences: what the article is about and its main point or claim.
- A blank line.
- 3-6 key points, each on its own line starting with "• ". Keep each to one or two sentences.

If the source is a discussion post rather than an article, recap the post itself. Write in the language of the source. Do not mention that you are summarising, and do not mention truncated or missing content — recap what is there.`

const CLAUDE_ARGS = [
  "-p",
  "--output-format", "stream-json",
  "--verbose",
  "--include-partial-messages",
  "--setting-sources", "",
  "--strict-mcp-config",
  "--disable-slash-commands",
  "--tools", "",
  "--no-session-persistence",
  "--effort", "low",
  "--model", RECAP_MODEL,
  "--system-prompt", SYSTEM_PROMPT,
]

const userMessage = (s: RecapSource) =>
  `Title: ${s.title}\n${s.url ? `URL: ${s.url}\n` : ""}\n<source>\n${s.text}\n</source>\n\nWrite the recap.`

// The stream-json lines we care about (everything else is ignored).
interface StreamLine {
  type: string
  event?: {
    type: string
    message?: { model?: string }
    delta?: { type: string; text?: string; stop_reason?: string | null }
  }
  is_error?: boolean
  result?: string
}

const runClaude = async (
  prompt: string,
  onDelta: (partial: string) => void,
  signal: AbortSignal,
): Promise<RecapResult> => {
  const cwd = configDir()
  mkdirSync(cwd, { recursive: true })
  // hntui may itself be started from inside a Claude Code session
  const env = { ...process.env }
  delete env.CLAUDECODE

  let proc: Bun.Subprocess<"pipe", "pipe", "pipe">
  try {
    proc = Bun.spawn(["claude", ...CLAUDE_ARGS], {
      cwd,
      env,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    } as const)
  } catch (cause) {
    const code = (cause as { code?: string }).code
    if (code === "ENOENT") {
      throw new RecapApiError({ kind: "missing", message: "claude not found on PATH" })
    }
    throw cause
  }
  const onAbort = () => proc.kill()
  signal.addEventListener("abort", onAbort, { once: true })

  try {
    proc.stdin.write(prompt)
    proc.stdin.end()

    let text = ""
    let model = RECAP_MODEL
    let stopReason: string | null = null
    let result: StreamLine | null = null
    const handle = (line: string) => {
      if (!line.trim()) return
      let msg: StreamLine
      try {
        msg = JSON.parse(line) as StreamLine
      } catch {
        return
      }
      if (msg.type === "stream_event" && msg.event) {
        const ev = msg.event
        if (ev.type === "message_start" && ev.message?.model) model = ev.message.model
        if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
          text += ev.delta.text ?? ""
          onDelta(text)
        }
        if (ev.type === "message_delta" && ev.delta?.stop_reason) stopReason = ev.delta.stop_reason
      } else if (msg.type === "result") {
        result = msg
      }
    }

    const decoder = new TextDecoder()
    let buf = ""
    for await (const chunk of proc.stdout) {
      buf += decoder.decode(chunk, { stream: true })
      const lines = buf.split("\n")
      buf = lines.pop() ?? ""
      for (const l of lines) handle(l)
    }
    handle(buf)
    const exit = await proc.exited
    const stderr = (await new Response(proc.stderr).text()).trim()

    const r = result as StreamLine | null
    if (r?.is_error) {
      const message = r.result ?? "unknown error"
      const kind = /not logged in|\/login/i.test(message) ? "auth" : "other"
      throw new RecapApiError({ kind, message })
    }
    if (stopReason === "refusal") {
      throw new RecapApiError({ kind: "refused", message: "" })
    }
    if (exit !== 0 && !r) {
      throw new RecapApiError({ kind: "other", message: stderr || `claude exited with ${exit}` })
    }
    const finalText = (text || r?.result || "").trim()
    if (!finalText) {
      throw new RecapApiError({ kind: "other", message: "Claude returned an empty recap." })
    }
    return { text: finalText, model }
  } finally {
    signal.removeEventListener("abort", onAbort)
  }
}

export const makeLiveSummarize =
  (): RecapTransportShape["summarize"] =>
  (source, onDelta) =>
    Effect.tryPromise({
      try: (signal) => runClaude(userMessage(source), onDelta, signal),
      catch: (cause) =>
        cause instanceof RecapApiError
          ? cause
          : new RecapApiError({
              kind: "other",
              message: cause instanceof Error ? cause.message : String(cause),
            }),
    }).pipe(
      Effect.timeoutFail({
        duration: "3 minutes",
        onTimeout: () => new RecapApiError({ kind: "other", message: "Claude took too long." }),
      }),
    )

export const makeLiveFetchPage =
  (): RecapTransportShape["fetchPage"] =>
  (url) =>
    Effect.gen(function* () {
      const res = yield* Effect.tryPromise({
        try: (signal) =>
          fetch(url, {
            signal,
            redirect: "follow",
            headers: {
              // a few sites serve an empty shell (or a 403) to the default UA
              "User-Agent": "Mozilla/5.0 (compatible; hntui recap)",
              Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
            },
          }),
        catch: (cause) =>
          new RecapFetchError({ url, reason: "request", detail: String(cause) }),
      })
      if (!res.ok) {
        return yield* new RecapFetchError({ url, reason: "status", detail: String(res.status) })
      }
      const type = res.headers.get("content-type") ?? ""
      if (type && !/text\/|xml|json/i.test(type)) {
        return yield* new RecapFetchError({ url, reason: "unsupported", detail: type })
      }
      return yield* Effect.tryPromise({
        try: () => res.text(),
        catch: (cause) =>
          new RecapFetchError({ url, reason: "request", detail: String(cause) }),
      })
    }).pipe(
      Effect.timeoutFail({
        duration: "15 seconds",
        onTimeout: () => new RecapFetchError({ url, reason: "timeout" }),
      }),
    )

export const RecapTransportLive = Layer.succeed(RecapTransport, {
  fetchPage: makeLiveFetchPage(),
  summarize: makeLiveSummarize(),
})

// ---------------------------------------------------------------------------
// RecapApi — the domain service: turn a story into a recap, cached per id.
// ---------------------------------------------------------------------------

export interface RecapOptions {
  readonly onDelta: (partial: string) => void
  // skip the cache and ask Claude again
  readonly fresh?: boolean
}

export interface RecapApiShape {
  readonly recap: (story: Item, opts: RecapOptions) => Effect.Effect<string, RecapError>
}

export class RecapApi extends Context.Tag("RecapApi")<RecapApi, RecapApiShape>() {}

// A page whose extracted text is shorter than this is most likely a JS shell,
// a paywall notice or a "enable cookies" page — not the article.
const MIN_PAGE_CHARS = 200

export const RecapApiLive = Layer.effect(
  RecapApi,
  Effect.gen(function* () {
    const transport = yield* RecapTransport
    const store = yield* RecapStore
    let entries = yield* store.load
    const cached = new Map(entries.map((e) => [e.id, e]))

    // What to hand to Claude: the linked page when there is one, otherwise
    // the post's own text (Ask HN, Tell HN, jobs).
    const sourceFor = (story: Item): Effect.Effect<RecapSource, RecapFetchError | RecapNoContent> =>
      Effect.gen(function* () {
        const title = story.title ?? "(untitled)"
        const own = htmlToText(story.text)
        if (story.url) {
          const html = yield* transport.fetchPage(story.url)
          const text = articleText(html)
          if (text.length >= MIN_PAGE_CHARS) {
            const pt = pageTitle(html)
            return { title: pt ? `${title} (${pt})` : title, url: story.url, text }
          }
          if (own) return { title, text: own }
          return yield* new RecapNoContent({ id: story.id })
        }
        if (own) return { title, text: own }
        return yield* new RecapNoContent({ id: story.id })
      })

    const recap: RecapApiShape["recap"] = (story, { onDelta, fresh = false }) =>
      Effect.gen(function* () {
        const hit = fresh ? undefined : cached.get(story.id)
        if (hit) {
          onDelta(hit.text)
          return hit.text
        }
        const source = yield* sourceFor(story)
        const result = yield* transport.summarize(source, onDelta)
        const entry: RecapEntry = {
          id: story.id,
          text: result.text,
          model: result.model,
          at: Date.now(),
        }
        cached.set(story.id, entry)
        entries = withRecap(entries, entry)
        yield* store.save(entries)
        return result.text
      })

    return RecapApi.of({ recap })
  }),
)

export const recap = (
  story: Item,
  opts: RecapOptions,
): Effect.Effect<string, RecapError, RecapApi> =>
  Effect.flatMap(RecapApi, (api) => api.recap(story, opts))
