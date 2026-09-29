import { forwardRef, useEffect } from "react"
import type { ScrollBoxRenderable } from "@opentui/core"
import { TextAttributes } from "@opentui/core"
import { CommentNode } from "../components/CommentNode"
import { Loader } from "../components/Loader"
import type { FlatComment } from "../hooks/useCommentTree"
import type { Item } from "../api/types"
import { hostname, htmlToText, relativeTime } from "../utils/format"
import { openUrl } from "../utils/openUrl"
import { selectionColors, useTheme } from "../theme"

export type DetailMode = "recap" | "comments"

export interface RecapView {
  text: string
  loading: boolean
  error: string | null
}

interface Props {
  story: Item
  mode: DetailMode
  recap: RecapView
  flat: FlatComment[]
  cursor: number
  collapsed: Set<number>
  loading: boolean
  saved?: boolean
  emptyMessage?: string
  onSelectComment: (idx: number) => void
  onToggleComment: (id: number) => void
  onOpenLinks: (id: number) => void
}

export const StoryDetailView = forwardRef<ScrollBoxRenderable, Props>(function StoryDetailView(
  {
    story,
    mode,
    recap,
    flat,
    cursor,
    collapsed,
    loading,
    saved,
    emptyMessage,
    onSelectComment,
    onToggleComment,
    onOpenLinks,
  },
  ref,
) {
  const t = useTheme()
  useEffect(() => {
    if (mode !== "comments") return
    const sb = (ref as React.RefObject<ScrollBoxRenderable>)?.current
    if (!sb || flat.length === 0) return
    const target = flat[cursor]
    if (!target) return
    sb.scrollChildIntoView(`comment-${target.node.item.id}`)
  }, [mode, cursor, flat])

  const host = hostname(story.url)
  const text = htmlToText(story.text)

  return (
    <box flexDirection="column" flexGrow={1}>
      <box
        flexDirection="column"
        flexShrink={0}
        paddingLeft={1}
        paddingRight={1}
        paddingTop={1}
        paddingBottom={1}
        backgroundColor={t.strip}
        border={["bottom"]}
        borderStyle="single"
        borderColor={t.border}
      >
        <text fg={t.text} {...selectionColors(t)} attributes={TextAttributes.BOLD} wrapMode="word">
          {saved ? "★ " : ""}
          {story.title ?? "(untitled)"}
        </text>
        <text {...selectionColors(t)}>
          <span fg={t.stripAccent}>▲ {story.score ?? 0}</span>
          <span fg={t.textDim}>{` by `}</span>
          <span fg={t.textMuted}>{story.by ?? "?"}</span>
          <span fg={t.textDim}>{`  ${relativeTime(story.time)}  | `}</span>
          <span fg={t.textMuted}>{`${story.descendants ?? 0} comments`}</span>
          {host ? <span fg={t.textDim}>{`  · ${host}`}</span> : null}
        </text>
        {story.url ? (
          <text fg={t.link} {...selectionColors(t)} onMouseDown={() => openUrl(story.url!)}>
            {story.url}
          </text>
        ) : null}
      </box>
      <scrollbox
        ref={ref}
        flexGrow={1}
        scrollY={true}
        scrollX={false}
        verticalScrollbarOptions={{
          trackOptions: { backgroundColor: t.scrollTrack, foregroundColor: t.scrollThumb },
        }}
      >
        {mode === "recap" ? (
          <RecapBody recap={recap} />
        ) : (
          <>
            {text ? (
              <box paddingLeft={1} paddingRight={1} paddingTop={1}>
                <text fg={t.textBody} {...selectionColors(t)} wrapMode="word">
                  {text}
                </text>
              </box>
            ) : null}
            <box paddingLeft={1} paddingRight={1} paddingTop={1}>
              {loading ? (
                <box flexDirection="row" alignItems="center" gap={1}>
                  <Loader />
                  <text fg={t.statusHint} {...selectionColors(t)}>Loading comments…</text>
                </box>
              ) : flat.length === 0 ? (
                <text fg={t.statusHint} {...selectionColors(t)}>{emptyMessage ?? "No comments yet."}</text>
              ) : (
                flat.map((fc, idx) => (
                  <CommentNode
                    key={fc.node.item.id}
                    node={fc.node}
                    depth={fc.depth}
                    collapsed={collapsed.has(fc.node.item.id)}
                    selected={idx === cursor}
                    hiddenChildren={fc.hiddenChildren}
                    onSelect={() => onSelectComment(idx)}
                    onToggle={() => onToggleComment(fc.node.item.id)}
                    onOpenLinks={() => onOpenLinks(fc.node.item.id)}
                  />
                ))
              )}
            </box>
          </>
        )}
      </scrollbox>
    </box>
  )
})

// The recap pane: streamed text with a caret while Claude is still writing,
// or the reason there is none.
function RecapBody({ recap }: { recap: RecapView }) {
  const t = useTheme()
  return (
    <box flexDirection="column" paddingLeft={1} paddingRight={1} paddingTop={1} paddingBottom={1} gap={1}>
      <text {...selectionColors(t)}>
        <span fg={t.accent}>✦ </span>
        <span fg={t.textMuted}>Recap by Claude</span>
        <span fg={t.textDim}>{"  ·  c comments"}</span>
      </text>
      {recap.error ? (
        <text fg={t.statusHint} {...selectionColors(t)} wrapMode="word">
          {recap.error}
          {"\n\nr to retry · c for comments"}
        </text>
      ) : recap.text ? (
        <text fg={t.textBody} {...selectionColors(t)} wrapMode="word">
          {recap.text}
          {recap.loading ? " ▍" : ""}
        </text>
      ) : (
        <box flexDirection="row" alignItems="center" gap={1}>
          <Loader />
          <text fg={t.statusHint} {...selectionColors(t)}>Asking Claude…</text>
        </box>
      )}
    </box>
  )
}
