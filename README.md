<h1 align="center">hntui-recap: Hacker News in your terminal, with Claude recaps</h1>

<p align="center">A fork of <a href="https://github.com/ahmd-sh/hntui"><b>hntui</b></a> by Ahmed Shaikh that opens each post on a recap of the article, written by Claude, instead of the comments.</p>

<p align="center">
  <img src=".github/assets/hntui-showcase.webp" alt="hntui — Hacker News in your terminal" width="800">
</p>

> **Standing on the shoulders of hntui.** Everything that makes this app good to use is Ahmed Shaikh's work in [ahmd-sh/hntui](https://github.com/ahmd-sh/hntui): the OpenTUI interface, the feeds, the comment tree, saved posts and history, the themes, the Knight Rider loader, the Effect-based data layer, the tests, the release tooling. This fork adds one thing on top, the recap pane, and follows upstream otherwise. If you just want a great Hacker News TUI, use the original. Thank you, Ahmed.

```bash
git clone https://github.com/simontjell/hntui-recap.git ~/src/hntui-recap
cd ~/src/hntui-recap && bun install && bun build --compile src/index.tsx --outfile ~/.local/bin/hntui
hntui
```

## What it does

- **New in this fork:** open a post and get a recap of the linked article, written by Claude and streamed into the terminal. Press `c` for the comments.
- Browse all six HN feeds: Top, New, Best, Ask, Show, and Jobs.
- Navigate through a post's comments.
- Save posts for later.
- Vim + mouse support.
- Themes.
- ... and a really cool Knight Rider scanner animation for loaders (⁠◕⁠ᴗ⁠◕⁠ )

## Requirements

Any modern terminal with truecolor, mouse support, and UTF-8 will work. Upstream hntui is developed in Ghostty on macOS; this fork is used daily in foot on Fedora (sway).

Building needs [Bun](https://bun.sh) 1.2 or newer. Recaps need [Claude Code](https://claude.com/claude-code) installed and logged in; everything else works without it.

## Install

This fork is not published anywhere, so it is built from source into a standalone binary. There are no prebuilt binaries and no npm package; those belong to the [original](https://github.com/ahmd-sh/hntui).

```bash
git clone https://github.com/simontjell/hntui-recap.git ~/src/hntui-recap
cd ~/src/hntui-recap
bun install
bun build --compile src/index.tsx --outfile ~/.local/bin/hntui
```

To update, `git pull` and build again. Do not run `hntui update`: it is inherited from upstream and would replace the binary with the original hntui.

## Run

```bash
hntui
```

Press `q` (or `Ctrl-C`) to quit.

## Recaps

Opening a post with `⏎` shows a recap of the linked article instead of the comments: a short paragraph on what it is about, then the key points. The page is fetched, its text extracted, and handed to Claude. Ask HN and other text-only posts get a recap of the post itself. Press `c` to switch to the comments and `c` again to come back, or `r` to throw the recap away and ask for a fresh one. Finished recaps are cached in `~/.config/hntui/recaps.json`, so reopening a post costs nothing.

Recaps are written by [Claude Code](https://claude.com/claude-code) in headless mode (`claude -p`), so they use the same login as the `claude` command and need no API key. Install Claude Code, run `claude` once and log in with `/login`. Without it the recap pane says so, and the comments work as before. Each recap is a single prompt with settings, plugins, MCP servers and tools switched off, so it costs about as much as the article is long.
## Keybindings

### Story list

| Key | Action |
|---|---|
| `j` / `↓`, `k` / `↑` | Move cursor |
| `gg`, `G` | Jump to first or last |
| `Ctrl-D`, `Ctrl-U`, `PgDown`, `PgUp` | Scroll a half page |
| `Enter` | Open the story's recap (by Claude) |
| `c` | Open the story's comments |
| `h` / `←`, `l` / `→` | Previous or next tab |
| `Tab`, `Shift-Tab` | Cycle through tabs |
| `1` through `6` | Jump to a specific category |
| `S` | Jump to the Saved list |
| `s` | Save or unsave the highlighted post |
| `o` | Open the story's URL in your browser |
| `r` | Refresh the current feed |
| `t` | Toggle theme |
| `q`, `Ctrl-C` | Quit |

### Story detail (recap)

| Key | Action |
|---|---|
| `j` / `↓`, `k` / `↑` | Scroll |
| `gg`, `G` | Jump to top or bottom |
| `Ctrl-D`, `Ctrl-U`, `PgDown`, `PgUp` | Scroll a half page |
| `c` | Switch to the comments |
| `r` | Regenerate the recap (also retries after an error) |
| `s` | Save or unsave this story |
| `o` | Open the story's URL |
| `Esc`, `Backspace`, `h` / `←` | Back to the list |

### Story detail (comments)

| Key | Action |
|---|---|
| `c` | Switch back to the recap |
| `j` / `↓`, `k` / `↑` | Move the comment cursor |
| `gg`, `G` | Jump to first or last comment |
| `Ctrl-D`, `Ctrl-U`, `PgDown`, `PgUp` | Scroll a half page |
| `Space` | Collapse or expand the current subtree |
| `Enter` | Open the links popup for the current comment |
| `s` | Save or unsave this story |
| `o` | Open the story's URL |
| `Esc`, `Backspace`, `h` / `←` | Back to the list |
| `t` | Toggle theme |
| `q` | Quit |

### Links popup

| Key | Action |
|---|---|
| `j`, `k`, `↑`, `↓` | Move |
| `gg`, `G` | First or last link |
| `o`, `Enter` | Open the highlighted link |
| `Esc`, `Backspace` | Close the popup |

### Context menu (right-click)

| Key | Action |
|---|---|
| `j` / `↓`, `k` / `↑` | Move |
| `Enter` | Activate |
| `Esc`, `Backspace` | Close |

### Mouse

Most things you can do with the keyboard, you can do with a mouse too.

- Click a tab to switch feeds.
- Click the `Y` tile to refresh the current feed (or to exit a story back to its list).
- Click any story row to select it. Click it again to open its recap.
- Right-click a story to open a context menu with Save, Open URL, Open Recap and Open Comments.
- Click a comment's header line to collapse or expand its subtree.
- Double-click a comment's body to open its links popup.
- Click the story URL in the detail header to open it in your browser.
- Click outside a popup or context menu to dismiss it.
- Use your scroll wheel to scroll lists, recaps and comment trees.

### Selecting and copying text

Because the app captures mouse events, your terminal's normal click-and-drag selection is intercepted. To select text the regular way:

- On macOS (Terminal.app, iTerm2, WezTerm, Ghostty), hold `Option` while you drag, then `Cmd-C`.
- On Linux (Kitty, Alacritty, WezTerm, GNOME Terminal), hold `Shift` while you drag, then `Ctrl-Shift-C`.

## Themes

Press `t` to toggle. The dark theme is mostly black with orange accents. The light theme is faithful to news.ycombinator.com: white background, orange topbar, the familiar beige row highlight, and HN's classic grey byline text.

## Saved posts

Press `s` on any story to save it. Saved posts get a small star next to the title and show up in the Saved tab on the right side of the tab strip. The list persists across sessions in `~/.config/hntui/saved.json` as a small JSON file. (Config from the app's `hackernuis` days is migrated automatically on first run.) Press `s` again to remove a post from the list.

`S` jumps straight to the Saved list from anywhere.

## Development

```bash
git clone https://github.com/simontjell/hntui-recap.git
cd hntui-recap
bun install
bun dev    # hot reload
bun test
```

Data comes from the public [Hacker News Firebase API](https://github.com/HackerNews/API). `HN_DEMO=1 bun dev` runs with a canned recap and a synthetic comment, so the UI can be exercised without Claude.

The recap code lives in `src/api/recap.ts` (the service, the prompt, the `claude -p` transport), `src/utils/article.ts` (page text extraction), `src/hooks/useRecap.ts` and the recap pane in `src/views/StoryDetailView.tsx`. Everything else is upstream hntui.

## Acknowledgments

- [hntui](https://github.com/ahmd-sh/hntui) by [Ahmed Shaikh](https://github.com/ahmd-sh). This project *is* hntui with a recap pane bolted on; the design, the code and the care are his. Go star the original.
- [Claude Code](https://claude.com/claude-code) by Anthropic writes the recaps.
- [OpenTUI](https://github.com/anomalyco/opentui) by Anomaly. The native TUI core that makes all of this possible.
- [opentui-spinner](https://github.com/msmps/opentui-spinner) by Matt Simpson. The Knight Rider loading scanner is adapted from `examples/knight-rider/utils.ts` (MIT).
- [Effect](https://effect.website) for empowering the data layer under the hood.
- [Hacker News](https://news.ycombinator.com) for the content and the open API.

## License

[MIT](./LICENSE), Copyright (c) 2026 Ahmed Shaikh. The fork keeps the original license and copyright.
