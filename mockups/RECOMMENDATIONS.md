# Asset Dashboard Suite — Visual & Feature Review

**Scope:** `index.html` (Asset Dashboard), `procurement.html`, `stores.html`
**Date:** 2026-06-17

The mockup PNGs in `mockups/out/` show concept redesigns — what each page *could*
look like. They are illustrative, not yet wired into the app.

---

## The core problem in one sentence

All three modules are *functionally* rich but share three dated visual habits that
make them feel like three different apps rather than one professional suite:

1. **Emoji used as icons** (🏠 📊 ⚠️ ➕) — renders differently on every OS, looks
   unprofessional, can't be coloured or sized cleanly.
2. **A different brand colour per module** — Assets = orange, Procurement = purple,
   Stores = green — so switching modules feels jarring.
3. **Gradient headers + heavy drop-shadows on every card** — a mid-2010s "Material v1"
   look that reads as cluttered next to modern enterprise tools (Stripe, Linear, Notion).

---

## Recommendation 1 — Adopt one unified design system

See `04_design_system.png`. Keep a single neutral palette (slate greys, one ink, one
border, one background) shared across all three modules, and give each module **one**
accent colour used sparingly (Assets = indigo, Procurement = violet, Stores = teal).
This keeps each area recognisable while making them obviously part of the same product.

| Token | Value |
|---|---|
| Page background | `#F1F5F9` |
| Card | `#FFFFFF` with `1px #E2E8F0` border |
| Ink / Text / Muted | `#0F172A` / `#334155` / `#64748B` |
| Accent (per module) | Indigo `#4F46E5` · Violet `#7C3AED` · Teal `#0D9488` |
| Success / Warning / Danger | `#16A34A` / `#D97706` / `#DC2626` (soft-tint pills) |

Replace `box-shadow: 0 4px 20px` everywhere with a `1px` border plus a *very* soft
elevation, reserved for cards and modals only.

## Recommendation 2 — Replace every emoji with an SVG icon set

Use Lucide / Feather / Tabler (all free, MIT). One `<link>` or inline sprite gives
crisp, single-colour, scalable icons for the sidebar, KPI cards, buttons and empty
states. This is the single highest-impact change for "looking professional."

## Recommendation 3 — Actually load the type

Every file declares `font-family: 'Inter'` but never loads it, so it silently falls
back to system fonts. Add the Google Fonts (or self-hosted) `Inter` link and define a
type scale: Display 26 / Heading 20 / Title 15 / Body 13 / Caption 11.

## Recommendation 4 — Upgrade the components

- **KPI cards** (all three dashboards): add a trend delta chip (`▲ +5.1%`) and a tiny
  sparkline so a number means something at a glance. See the top row of every mockup.
- **Tables:** zebra striping, sticky header, status **pills** (not coloured text),
  monospace asset/PO codes, and inline data bars for stock levels (`03_stores.png`).
  Add client-side sort + search — currently tables are static and unsortable.
- **Status by colour alone fails accessibility** — pills pair colour + text, which fixes
  it for colour-blind users.
- **Replace `alert()` confirmations** with inline toasts and live form validation.

## Recommendation 5 — Module-specific wins

**Asset Dashboard (`01`)** — The 15 pages are powerful but buried. Group the sidebar
into sections (Overview / Registers / Tools / Reports). Promote the category bar chart
and distribution donut to the top of the dashboard; add a "Recent Asset Activity" table
with status pills (In Service / Maintenance / Board of Survey).

**Procurement (`02`)** — The GOJ 7-stage lifecycle is the star feature; render it as a
proper horizontal stepper with done/active/todo states tied to the live requisition.
Pair the PO table with an "Awaiting Your Approval" side panel showing priority pills and
value — turns the dashboard into an action queue, not just a report.

**Stores (`03`)** — Lead with operational risk: Low/Out-of-stock and Expiring-soon KPIs,
a colour-coded stock-level bar in every inventory row, a Reorder Alerts panel, and a
stock-value-by-category donut. The quarterly-view section currently has hardcoded colours
that break dark mode — move them to CSS variables.

## Recommendation 6 — Polish & consistency (lower effort)

- Standardise border-radius to **4 / 8 / 12px** only (currently 8 different values).
- Move all hardcoded hex colours into CSS variables so dark mode is complete (the PO
  preview and Quarterly View currently break in dark mode).
- Unify button hover (`translateY(-2px)` everywhere — some use `scale()`).
- De-duplicate the badge styles in `procurement.html` (defined twice).
- Test real mobile widths (320px) — form grids with `minmax(280px)` overflow small phones.

---

## Suggested sequencing

1. **Quick wins (½–1 day each):** load Inter, swap emoji → SVG icons, soften shadows,
   add status pills + zebra tables. Biggest visual payoff for least effort.
2. **Structural:** unified token file shared across the three HTML files; KPI card
   redesign with deltas/sparklines.
3. **Feature:** sortable/searchable tables, toast notifications, the procurement stepper
   and stores alert panels.
