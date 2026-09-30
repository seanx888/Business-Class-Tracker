# Source

Vendored from https://github.com/vercel-labs/agent-skills (Vercel Labs)
at commit 063bee9 — `skills/web-design-guidelines/SKILL.md`.

No LICENSE file was present in the upstream repo at that commit.

This skill fetches the live Web Interface Guidelines from
https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
on every run via WebFetch, so the rules themselves always stay current — only the
skill wrapper is vendored here.

To update: re-copy `skills/web-design-guidelines/SKILL.md` from upstream.
