import { useEffect, useState } from "react"
import { Effect, Fiber } from "effect"
import { AppRuntime } from "../runtime"
import { recap } from "../api/recap"
import type { RecapError } from "../api/recap"
import type { Item } from "../api/types"

interface RecapState {
  key: string
  text: string
  done: boolean
  error: RecapError | null
}

const EMPTY: RecapState = { key: "", text: "", done: false, error: null }

// Streams a recap of `story` into React state. `refreshKey` > 0 bypasses the
// cache (the user asked for a fresh one). Switching stories interrupts the
// in-flight fetch + Claude call and DERIVES empty+loading state on the very
// same render, like useCommentTree.
export function useRecap(story: Item | null, refreshKey = 0) {
  const key = story ? `${refreshKey}|${story.id}` : ""
  const [state, setState] = useState<RecapState>(EMPTY)

  useEffect(() => {
    if (key === "" || !story) return
    const fiber = AppRuntime.runFork(
      recap(story, {
        fresh: refreshKey > 0,
        onDelta: (text) => setState({ key, text, done: false, error: null }),
      }).pipe(
        Effect.match({
          onSuccess: (text) => setState({ key, text, done: true, error: null }),
          onFailure: (error) => setState((s) => ({ key, text: s.key === key ? s.text : "", done: true, error })),
        }),
      ),
    )
    return () => {
      AppRuntime.runFork(Fiber.interrupt(fiber))
    }
  }, [key])

  const fresh = key !== "" && state.key === key
  return {
    text: fresh ? state.text : "",
    loading: key !== "" && !(fresh && state.done),
    error: fresh ? state.error : null,
  }
}
