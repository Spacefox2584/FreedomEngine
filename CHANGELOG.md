# FreedomEngine — Changelog

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
