import { describe, expect, test } from "bun:test"
import { MAX_ARTICLE_CHARS, articleText, pageTitle } from "./article"

const PAGE = `<!doctype html>
<html><head><title>  Hello &amp;
  World </title><style>body{color:red}</style>
<script>console.log("<p>not text</p>")</script></head>
<body>
<nav><a href="/">Home</a> <a href="/about">About</a></nav>
<header><h1>Site name</h1></header>
<main>
  <h1>The &quot;real&quot; headline</h1>
  <p>First   paragraph with <b>bold</b> and <a href="x">a link</a>.</p>
  <!-- a comment -->
  <p>Second paragraph.</p>
  <aside>Related: clickbait</aside>
</main>
<footer>© 2026</footer>
</body></html>`

describe("articleText", () => {
  test("keeps the body text and drops scripts, styles, nav and footer", () => {
    const t = articleText(PAGE)
    expect(t).toContain('The "real" headline')
    expect(t).toContain("First paragraph with bold and a link.")
    expect(t).toContain("Second paragraph.")
    expect(t).not.toContain("console.log")
    expect(t).not.toContain("color:red")
    expect(t).not.toContain("Home")
    expect(t).not.toContain("Site name")
    expect(t).not.toContain("clickbait")
    expect(t).not.toContain("© 2026")
    expect(t).not.toContain("a comment")
  })

  test("separates block elements with blank lines", () => {
    const t = articleText(PAGE)
    expect(t).toMatch(/headline\n\nFirst paragraph/)
    expect(t).toMatch(/a link\.\n\nSecond paragraph\./)
    expect(t).not.toMatch(/\n{3}/)
  })

  test("falls back to the whole document when there is no article/main", () => {
    const t = articleText("<html><body><div>Plain <i>page</i></div><p>Bye</p></body></html>")
    expect(t).toBe("Plain page\n\nBye")
  })

  test("caps the output length", () => {
    const t = articleText(`<p>${"x".repeat(MAX_ARTICLE_CHARS * 2)}</p>`)
    expect(t.length).toBe(MAX_ARTICLE_CHARS)
  })
})

describe("pageTitle", () => {
  test("decodes and collapses the title", () => {
    expect(pageTitle(PAGE)).toBe("Hello & World")
  })

  test("is empty when there is no title", () => {
    expect(pageTitle("<p>hi</p>")).toBe("")
  })
})

describe("articleText tables", () => {
  test("table cells are separated by line breaks", () => {
    const t = articleText("<table><tr><th>Available in</th><td>English</td></tr></table>")
    expect(t).toBe("Available in\nEnglish")
  })
})
