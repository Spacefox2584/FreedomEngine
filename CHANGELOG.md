# FreedomEngine — Changelog

## FE.01.A2.R5.3 — C-Deck UI Polish
- Right pane closes when clicking outside it
- Default theme is Dark; theme button reflects current theme
- Default layout is Compact (unless user saved preference)
- C-Deck priorities reduced to 3 states: Urgent / Normal / Backlog (legacy values collapse to Normal)
- Card visuals updated:
  - Urgent: most obvious (red strip + stronger shadow)
  - Normal: restrained (purple strip + lighter shadow)
  - Backlog: recedes (neutral strip + reduced emphasis)
- Priority strip thicker
- Card delete (×) button is circular; white/neutral by default, red on hover
- Top-right pill buttons have clearer hover states

## FE.01.A2.R5
- Added FE_DEFAULT_WORLD_ID support to force a shared default world across devices (fixes normal vs incognito world mismatch). — Live World MVP (Offline-first Sync)

**Goal:** same world can be open on two devices and stay in sync, with minimal presence.

- Added Supabase-backed "Live World" sync layer (cards + lanes)
- Offline-first preserved: UI still reads/writes locally first
- Resync loop: local journal tail replays to Supabase when back online
- Realtime subscriptions: remote edits flow in silently (no modals)
- Status pill now reflects: Local / Offline / Syncing / Live / Degraded
- Added migration SQL for Live World tables (supabase/migrations/001_r5_live_world.sql)
- Added build step to generate runtime env (core/runtime-env.js) from Vercel env vars

Not included:
- Operator logins + avatars
- “Editing…” indicators
- Permissions/teams
- Analytics


## FE.01.A1.R4.3 — Interaction & Navigation Clarity

- Fixed mouse left/right arrow behaviour (no accidental pane opening)
- Improved card action visibility and delete affordance
- Added inline delete for individual card notes
- Active Space is now clearly indicated (theme-aware)
- No persistence or schema changes

Not included:
- Multi-user live presence
- Permissions
- Undo / trash recovery


## FE.01.A1.R4.2 — C-Deck Priority + Ordering + Inline Note Edit
- Priority added to cards (Urgent/Today/Normal/Backlog) with coloured strip signifier
- New cards append to bottom (createdAt ordering)
- Lane arrows fixed (stable lane order)
- Notes now support inline per-note editing
- Card delete added (X on card + confirm in pane)

Not included:
- No Live World
- No Supabase sync
- No mobile redesign


## FE.01.A1.R4.1 — C-Deck Interaction Polish
- Dragging cards no longer selects text (desktop fast-drag fix)
- Card editor added (Edit button in pane: title, lane, channel, summary, next action)

Not included:
- No Live World
- No Supabase sync
- No mobile redesign


## FE.01.A1.R4 — Layout Headroom
- Layout modes: Compact / Wide (operator toggle)
- Wide mode centers content for ultrawide monitors
- Layout preference saved locally per device

Not included:
- No Live World
- No Supabase sync
- No auth/presence
- No mobile redesign


## FE.01.A1.R3.2 — Operator Chrome
- Topbar: Changelog + Feedback
- C-Deck: New card opens pane form (title/details) instead of blind create

Not included:
- No Supabase sync
- No auth/presence
- No Live World


## FE.01.A1.R3.1 — Pane Layout Fix
- Desktop: pane no longer reserves width by default (off-canvas intent)

Not included:
- No mobile redesign


## FE.01.A1.R3 — Snapshots + Moves
- Snapshot compaction to bound journal growth
- C-Deck: lane movement + notes
- Inspector: basic stats
