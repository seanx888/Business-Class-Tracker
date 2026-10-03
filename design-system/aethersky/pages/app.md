# App override — Business Class Tracker PWA (all tabs)

> Overrides `../MASTER.md` for the installed mobile app. Generated with the ui-ux-pro-max skill
> (`--design-system` "travel flight deals tracker mobile app minimal", style **Minimalism & Swiss Style**,
> typography match **Minimal Swiss**), then adjusted for a Traditional-Chinese, data-dense deal list.

## Why these deviations from MASTER

| MASTER | Override | Reason |
|---|---|---|
| Background `#EFF6FF` (blue tint), foreground `#1E40AF` (blue text) | Background `#F8FAFC`, text `#0F172A` | Swiss/minimal = neutral canvas, near-black text; blue body text reads as links and lowers crispness. Primary navy stays for active/selected states. |
| Body font Playfair Display | **Inter** (Latin, numbers) + system CJK (PingFang TC / Noto Sans TC) | Content is mostly Traditional Chinese; Playfair has no CJK glyphs and is editorial, not "簡潔俐落". Matches the skill's "Minimal Swiss" pairing (Inter/Inter). |
| Accent orange on primary buttons | Orange **only** for hot deals / possible error fares | One strong signal color = scannable list. Primary actions use navy. |
| Cards with `shadow-md` + lift on hover | 1px border, `shadow-sm` at most, no movement | Flat Swiss surfaces; pressed state must not shift layout (pro-rules). |
| Funnel landing pattern | Not used | This is an app, not a landing page. |

## Tokens

Light: bg `#F8FAFC` · surface `#FFFFFF` · subtle `#F1F5F9` · line `#E2E8F0` · text `#0F172A` · muted `#475569`
· primary `#1E3A8A` (soft `#EEF2FF`) · accent `#EA580C` (text `#C2410C`) · good `#047857` · bad `#B91C1C`.

Dark (checked separately): bg `#0B1120` · surface `#111827` · subtle `#1A2333` · line `#243044` · text `#F1F5F9`
· muted `#9AA7BB` · primary `#93C5FD` (soft `#172554`) · accent `#FB923C` · good `#34D399` · bad `#F87171`.

Alliance marks (text + dot, never color alone): SkyTeam `#0369A1`/`#7DD3FC`, Star `#334155`/`#CBD5E1`,
oneworld `#6D28D9`/`#C4B5FD`, none = muted.

Radius: cards 12px, controls 8px, pills 999px. Spacing: 4/8/12/16/24/32. Base font 16px, line-height 1.5,
prices `font-variant-numeric: tabular-nums`.

## Rules applied (from the skill's priority table + pro-rules checklist)

- SVG icons only (Phosphor regular, one family); decorative icons `aria-hidden="true"`; icon-only buttons have `aria-label`.
- Touch targets ≥ 44px (chips extend their hit area); 8px+ gaps.
- Filter chips wrap (no clipped horizontal chip rows); secondary filters behind a "篩選" disclosure with an active-count badge.
- Bottom nav: 4 items, labels always visible; tabs are URL hash routes so Back works and tabs are deep-linkable.
- Focus rings visible (`:focus-visible`), `prefers-reduced-motion` respected, 150–200 ms colour/opacity transitions only.
- Colour is never the only indicator (deal tier = icon + word + score; savings = sign + word).
- Safe areas respected for header and tab bar; content never hidden behind fixed bars.

## Screens added 2026-10 (search, community, promotions, playbooks)

- **Search (Routes → 搜尋)** — one column. Trip type is a 3-way segmented control; places are free text (codes or names in three
  languages) with a one-line hint underneath ("TPE — 台北桃園" or the error); multi-city legs are stacked cards (2–5) with a remove
  button and an "add flight" row. Cabin / stops / alliance are wrapping chips; airlines are removable chips plus a datalist input;
  passengers, bags and longest trip sit behind a "More" disclosure with an active-count badge.
- **Tracking is part of the form** — a switch panel ("追蹤這個搜尋") expands target price, flexible days, alert type, who to notify and
  the daily country check; the primary button's label changes ("搜尋" → "搜尋並追蹤"), and a result's detail has "追蹤這個搜尋".
  Without live search the page shows free deep links instead; nothing is hidden or disabled without a sentence saying why.
- **Community / promotions** — cards, not a table: tag row (type, alliance, new, deadline, lock), title link (opens the source), route
  or brands, price in TWD with the original currency, a 3-line summary clamp, then actions. Filters are wrapping chips (no clipped
  scroll rows). Source health and the paste-a-post importer live behind disclosures at the edges of the list.
- **Playbooks** — accordion cards. Risk is a tag with a word (低/中/高風險) and effort is dots plus a word; the cost calculator's
  verdict uses an arrow icon plus "省 / 貴" wording, never colour alone.
- Background data (the feed, search availability) never redraws a screen while a text field has the keyboard.

