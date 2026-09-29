import { Layer, ManagedRuntime } from "effect"
import { HnApiLive, HnTransportLive } from "./api/hn"
import { HnTransportLinkDemo } from "./api/hnDemo"
import { RecapApiLive, RecapStoreLive, RecapStoreMemory, RecapTransportLive } from "./api/recap"
import { RecapTransportDemo } from "./api/recapDemo"

// The app's single composition point: the whole layer graph is decided here,
// once, at the edge. Everything below runs against whatever this provides —
// HN_DEMO=1 swaps the transports and no other file knows or cares.
// (A real app would keep demo code out of the production bundle via separate
// entry points; for a TUI this trade is fine.)
const demo = process.env.HN_DEMO === "1"

const hn = HnApiLive.pipe(Layer.provide(demo ? HnTransportLinkDemo : HnTransportLive))

// demo recaps stay in memory so they never end up in the real on-disk cache
const recaps = RecapApiLive.pipe(
  Layer.provide(
    demo
      ? Layer.merge(RecapTransportDemo, RecapStoreMemory)
      : Layer.merge(RecapTransportLive, RecapStoreLive),
  ),
)

export const AppRuntime = ManagedRuntime.make(Layer.merge(hn, recaps))
