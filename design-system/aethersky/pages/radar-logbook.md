# Page overrides: Radar Lite and Logbook

> Overrides `MASTER.md` for the two new surfaces. Built with the design skills added on 2026-09-30
> (`taste-skill`, `awesome-design-md`, `web-design-guidelines`) on top of `ui-ux-pro-max`.

## 1. Design read (taste-skill §0)

Mobile product UI (out of taste-skill's landing-page scope, so only its cross-cutting rules apply) for premium frequent flyers,
in a calm, dense, night-sky Swiss language, leaning on the existing Material 3 theme and `AetherColors`, with **Linear**'s
surface ladder and hairline discipline as the reference brand.

Dials: **VARIANCE 3 · MOTION 2 · DENSITY 6** (same as MASTER: symmetric grids, almost no animation, standard app density).

## 2. Tokens taken from the reference (awesome-design-md: `linear.app`)

| Linear token | Use here | Flutter |
|---|---|---|
| canvas `#010102`, surface ladder `#0f1011 → #191a1b` | dark theme depth by surface step, not by shadow | existing `AetherColors.night`, card `#111A2E` (navy-tinted, kept for brand) |
| hairline `#23252a` / strong `#34343a` | 1 px borders around grouped content, range rings, chart axes | card border `#223052`, ring colour = `outlineVariant` |
| single accent `#5e6ad2` | **one** accent per screen | Radar/Logbook accent = `AetherColors.air` (same blue as "in the air"); gold stays for premium badges only |
| ink / ink-muted / ink-subtle | three text levels, nothing else | `onSurface`, `onSurfaceVariant`, and 60% `onSurfaceVariant` for captions |
| tabular numerals | every number column | `tabular` style (already used) |

Honest note: DESIGN.md files are inspired interpretations, not the brand's own system; values are a reference, the app keeps its own palette.

## 3. Rules applied from taste-skill

- **One accent, one radius scale**: cards 16, chips and inputs 12, pills full. Nothing else.
- **No AI tells**: no glow, no decorative dots, no gradient text, no emoji as icons (Material icons only; country flags are data, not decoration).
- **No em dash in new copy**; ellipsis is `…`. Copy re-read once for broken phrases.
- **States are part of the design**: loading (skeleton rows shaped like the final rows, not a spinner), empty (says how to fill it), error (says what to do next), permission denied (offers the alternative).
- **Long lists**: grouped by year with one header per group, no hairline under every row; rows are 56 dp minimum.
- **No filled bar tracks** in charts: bars are a bare 6 dp rounded fill next to a number.
- **Contrast**: text on tinted chips uses `onSurface`, never the tint colour itself, unless it is a status word that also has an icon.

## 4. Rules applied from web-design-guidelines (translated to Flutter)

| Guideline | Flutter implementation |
|---|---|
| Icon-only buttons need a label | every `IconButton` has `tooltip` (doubles as semantics label) |
| Decorative icons hidden from assistive tech | `ExcludeSemantics` around purely decorative glyphs |
| Async updates announced politely | radar summary line is a `Semantics(liveRegion: true)` |
| Honor reduced motion | no looping animation; anything animated checks `MediaQuery.disableAnimationsOf` |
| Tabular numbers, `…`, non-breaking space before units | `tabular` style, ` ` between number and `ft`/`kt`/`km` |
| Long text truncates, flex children can shrink | `Expanded` + `TextOverflow.ellipsis` on every title |
| Empty states, short / long input | every list has an empty state; names and notes tested with long text |
| Large lists are virtualised | `ListView.builder`, `GridView.builder` |
| Destructive actions need undo or confirmation | photo and entry removal use an undo `SnackBar` |
| Gestures need an alternative | tapping an aircraft on the sky view has the list as its equivalent |
| Inputs: correct type, no autocorrect on codes, placeholders end with `…` | `keyboardType`, `autocorrect: false`, hint text |
| Locale-aware dates and numbers | `intl` formatters, never hand-built strings |
| Specific button labels | "Save entry", "Add photo", never "OK" |

## 5. Audit of the shipped screens (web-design-guidelines, fetched 2026-09-30)

Checked `features/radar/*` and `features/logbook/*` rule by rule. Fixed during the audit:

- **Destructive actions** had no undo: flights (with their log entry), membership cards and travel documents now show "Removed X" with Undo; log photos are deleted from the phone only after the message is gone and was not undone.
- **Unsaved changes**: the entry sheet asks before discarding (back button, scrim tap, close icon). Drag-to-dismiss is off for that sheet because it would bypass the check and fights with scrolling the form.
- **autoFocus** removed from the airport search (guideline: avoid on mobile); the common airports are visible first.
- **Icon-only buttons** all carry a tooltip; the delete icons in Wallet were labelled "Cancel" and now say "Remove".
- **Touch targets**: photo remove button raised to 40 dp, star buttons are 48 dp.
- **Input limits**: aircraft type 30, registration 12, review 2,000 characters.
- **Route text** uses `→` like the rest of the app instead of an English "to" (which read badly in Chinese and Korean).
- **Auto-retry**: failed providers now surface the error and a Retry button at once (Riverpod 3 retried silently for minutes).

Deliberate deviations, recorded so they are not "fixed" later:

- **Sentence case** for English labels ("Track this flight"), matching the rest of the app, not Title Case: the shape-consistency rule of taste-skill beats a per-screen guideline.
- Numbers use `NumberFormat('en_US')` grouping like the rest of the app; zh, en and ko all group by commas, so the output is identical to the locale formatter.
- Web-only rules (skip links, `<meta theme-color>`, hydration, `touch-action`) do not apply to a Flutter app; the web build is a secondary target.
