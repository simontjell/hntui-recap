import { Match } from "effect"
import type { HnError } from "../api/hn"
import type { RecapError } from "../api/recap"

// The last mile of typed errors: every HnError member must map to copy a
// human can act on. Match.exhaustive makes this a compile-time guarantee —
// adding a new error to HnError breaks this build until it gets a message.
export const hnErrorMessage: (e: HnError) => string = Match.type<HnError>().pipe(
  Match.tag("HnRequestError", () => "Couldn't reach Hacker News — check your connection."),
  Match.tag("HnTimeoutError", () => "Hacker News took too long to respond."),
  Match.tag("HnStatusError", (e) => `Hacker News returned HTTP ${e.status}.`),
  Match.tag("HnDecodeError", () => "Hacker News sent a response the app couldn't understand."),
  Match.exhaustive,
)

// Same contract for recaps: every RecapError member gets copy a human can
// act on, checked at compile time.
export const recapErrorMessage: (e: RecapError) => string = Match.type<RecapError>().pipe(
  Match.tag("RecapNoContent", () => "Nothing to recap — this post has no readable article or text."),
  Match.tag("RecapFetchError", (e) =>
    e.reason === "timeout"
      ? "The article took too long to load."
      : e.reason === "status"
        ? `The article's site returned HTTP ${e.detail ?? "error"}.`
        : e.reason === "unsupported"
          ? "The link isn't a web page (probably a PDF, image or video)."
          : "Couldn't fetch the article — check your connection.",
  ),
  Match.tag("RecapApiError", (e) =>
    e.kind === "missing"
      ? "Recaps need Claude Code — the `claude` command wasn't found."
      : e.kind === "auth"
        ? "Not logged in to Claude Code — run `claude` and use /login."
        : e.kind === "refused"
          ? `Claude declined to recap this page. ${e.message}`.trim()
          : `Claude returned an error: ${e.message}`,
  ),
  Match.exhaustive,
)
