---
name: awesome-design-md
description: Library of DESIGN.md reference files reverse-engineered from real product/brand design systems (Stripe, Apple, Notion, Linear, Airbnb, and 70 more). Use when asked to design or build UI "in the style of <brand>", to match an existing brand's look and feel, or to pick concrete color/type/spacing tokens instead of guessing generic defaults.
---

# Awesome DESIGN.md

A DESIGN.md is a plain-text design-system document — colors, typography, spacing,
motion, and component rules — that an AI agent can read to generate UI consistent
with a specific brand's visual language. This is a curated library of them,
reverse-engineered from real developer-focused websites.

## When to use this

- The user names a reference brand ("make it feel like Stripe", "Linear-style",
  "Apple-ish", "give me a Notion vibe") for a page, component, or redesign.
- You need concrete design tokens (hex colors, font stacks, radii, shadows) rather
  than inventing generic ones.
- List `design-md/` directly for the available brand names before assuming one
  isn't covered.

## How to use it

1. Find the closest matching brand directory under `design-md/<brand>/DESIGN.md`
   (case-insensitive match on brand/company name; check a few near-synonyms —
   e.g. "x.ai", "mistral.ai", "linear.app" use their site-style slugs).
2. Read that `DESIGN.md` file. It has YAML frontmatter with `colors`, `typography`,
   and related token blocks, followed by prose usage notes.
3. Apply the tokens directly (CSS variables, Tailwind config, etc.) rather than
   re-deriving your own palette — that's the point of vendoring these.
4. If no brand matches, say so rather than fabricating one, and fall back to the
   `ui-ux-pro-max` or `taste-skill` skills (if installed) for general design taste.

## Available brands

See the `design-md/` directory for the full list (74 as of vendoring) — includes
apple, airbnb, stripe, notion, linear.app, figma, vercel, spotify, uber, nike,
tesla, bmw, and many more. Each brand's `DESIGN.md` is self-contained.

## Attribution

Each `DESIGN.md` states it is an "inspired interpretation" / analysis, not the
brand's actual internal design system — treat values as a strong visual reference,
not ground truth pulled from the company itself.
