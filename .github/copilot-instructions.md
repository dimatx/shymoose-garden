# Copilot instructions — shymoose-garden

**Read [`AGENTS.md`](../AGENTS.md) first and follow it end to end.** It is the
source of truth for how to add and publish plants in this repo.

Quick reminders (full detail in AGENTS.md):

- Adding a plant is a pipeline, not a single edit: import → **research care data
  against multiple reputable sources** (NCSU Extension, Missouri Botanical
  Garden, RHS — these outrank vendor pages) → **fetch and verify the photo
  yourself** (with credit) → fill frontmatter → `gen:shortlinks` →
  `gen:signs` (in that order — signs embed the short URL) → build → commit
  everything together.
- "It built successfully" is NOT done. A plant is finished only with reconciled
  care data, a verified+credited photo, a `shortUrl`, a matching
  `signs/<slug>.scad`, a clean build, and one commit containing all of it.
- Never commit or echo `.env` (holds `SHLINK_API_KEY`, `PLANTS_SHEET_CSV_URL`).
- Node >= 22, Windows PowerShell — chain commands with `;`, not `&&`.
