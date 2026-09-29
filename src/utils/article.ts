import { decodeEntities } from "./format"

// Hard cap on what we hand to Claude: ~40k chars is roughly 10k tokens,
// plenty for a recap and keeps a single call cheap and fast.
export const MAX_ARTICLE_CHARS = 40_000

// Best-effort readable text from an arbitrary web page. No DOM, no
// readability heuristics beyond "prefer <article>/<main>, drop chrome" —
// Claude is good at ignoring leftover navigation noise, so we optimise for
// never losing the body rather than for a clean extraction.
export function articleText(html: string): string {
  let s = html
    // drop whole subtrees that never contain article text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, "")

  const scoped = pick(s, "article") ?? pick(s, "main") ?? s
  s = scoped
    .replace(/<(nav|header|footer|aside|form)\b[\s\S]*?<\/\1>/gi, "")
    // block-level tags become paragraph/line breaks so structure survives
    .replace(/<\/(p|div|section|h[1-6]|li|blockquote|pre|tr|article|main)>/gi, "\n\n")
    .replace(/<\/(td|th|dt|dd)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")

  return decodeEntities(s)
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_ARTICLE_CHARS)
}

// The content of the first <tag>…</tag>, or null when the page has none.
function pick(html: string, tag: string): string | null {
  const m = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i").exec(html)
  return m ? m[1]! : null
}

// The <title> of a page, for prompts when the HN title is generic.
export function pageTitle(html: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  return m ? decodeEntities(m[1]!.replace(/\s+/g, " ")).trim() : ""
}
