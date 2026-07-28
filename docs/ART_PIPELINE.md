# Art pipeline — how this game's images get made

Every bitmap asset in the game was generated through one of the two routes
below. This file exists because the method kept getting rediscovered from
scratch; check here before assuming anything is impossible.

## What has been produced this way

| Asset set | Count | Spec | Location |
|---|---|---|---|
| Species portraits | 65 | 320×320 RGBA, transparent, adult-only, 3/4 hero pose | `public/sprites/<id>.png` |
| League arena backdrops | 10 | 1400×788 JPEG, painterly matte | `public/backgrounds/` |
| Area backdrops | 8 | 1400×788 JPEG, same look | `public/backgrounds/` |
| **Battle sprites** (generated) | **0 of 260** | 128×128 RGBA, side profile, 4 frames | `public/battle/<id>-<frame>.png` |
| **Rigged pixel sprites** (Route C) | **all 65, computed** | 48×48, 6 anims × 8 frames | none — built at runtime |

The first three sets are done. Battle sprites are specified
(`docs/BATTLE_SPRITES.md`) and tooled (`tools/battle_sprite.py`) but **not yet
generated** — see Status below.

## Route A — OpenAI API (the fast path, when it works)

`gpt-image-1` with `background: transparent` gives **native alpha**, so no
flood-fill and no white halo. This is the preferred route.

```bash
# needs OPENAI_API_KEY in the environment (it is set on this machine)
python3 tools/gen_image.py "<prompt>" out.png
```

**Known failure:** `400 billing_hard_limit_reached`. This is a hard account
cap — it is NOT worked around by asking for a cheaper size, quality or model.
When you see it, switch to Route B.

## Route B — Codex CLI (the billing-cap workaround)

The `codex` CLI has a built-in `image_gen` tool authenticated by the **ChatGPT
subscription**, which bypasses the API billing cap entirely. This is how all 65
portraits and all 18 backdrops were actually made.

```bash
codex exec --skip-git-repo-check \
  "Generate exactly one image and do nothing else (no code, no file edits). Image: <SUBJECT>; <STYLE WRAPPER>."
```

- Output lands in `~/.codex/generated_images/<session>/*.png` — **RGB with a
  solid background**, ~1024px. There is no destination argument; copy it out.
- Find the newest raw:
  ```bash
  find ~/.codex/generated_images -name '*.png' -printf '%T@ %p\n' | sort -rn | head -1 | cut -d' ' -f2-
  ```
- ⚠️ **Path form:** that yields a git-bash path (`/c/Users/...`). Windows Python
  needs `C:/Users/...` — convert with `sed 's|^/c/|C:/|'` or Pillow throws
  `FileNotFoundError`.
- Ask for a **plain solid pure-white background** so the flood-fill has a clean
  seed, unless the art itself is light — then pick a contrasting flat colour.

**Known failure:** `image generation failed: http 403 Forbidden`. The codex
agent itself still works (it answers, burns tokens) — only the image service
refuses. Seen 2026-07-27 despite the same command succeeding 2026-07-26 16:45,
so treat it as a subscription image quota/entitlement issue rather than a
broken prompt. Nothing about the prompt fixes it.

## Post-processing

| Asset kind | Script | Anchoring |
|---|---|---|
| Portraits | `image-gen-codex` skill's `process.py` | bbox-**centred** |
| Battle sprites | `tools/battle_sprite.py` | **foot-anchored, one shared scale** |

⚠️ They are deliberately different. Centring each frame's bounding box is right
for a single still portrait and **wrong for animation** — a walk frame whose
creature is a few pixels shorter gets re-centred, so the sprite bobs and slides
instead of walking. See `docs/BATTLE_SPRITES.md`.

## Matching an existing set

Read one existing asset first and mirror its look in a **shared style wrapper**
appended to every subject prompt. Check size/mode/framing with Pillow
(`Image.open(p).size, .mode, .getbbox()`). Consistency across a set comes from
the wrapper being identical, not from the subject descriptions.

## Batching

One `codex exec` per asset, ~1–3 min each including agent overhead. Run the loop
with `run_in_background: true` and post-process each raw as it lands. 65 species
× 4 frames = 260 images ≈ 4–13 hours of wall clock, so batch overnight and
verify in the morning rather than blocking on it.

## Route C — draw it in code (no art service at all)

When both routes above are down, small pixel art can be **computed**. `src/field/
pixelRig.ts` builds each creature from parts — torso, head, two arms, two legs,
tail — and animates it by rotating the joints, so arms genuinely swing and legs
genuinely stride. Six animations × 8 frames per species, generated into a sprite
sheet at load and cached.

Colour is **inherited, not invented**: `tools/sample_ramp.py` derives a 5-step
ramp from each species' existing portrait, so a rigged sprite still looks like
the creature the player knows.

```bash
python3 tools/sample_ramp.py kongrath aegisox maneleo grivvel ursath
```

⚠️ Three failures worth not repeating, none of them visible in a still frame:
- **Hue by circular mean gives a purple gorilla.** A silverback has warm fur AND
  a cool silver back; averaging two opposite hues lands between them and matches
  neither. Use the peak of a saturation-weighted hue histogram.
- **No saturation floor.** Forcing a minimum saturation onto a near-achromatic
  creature invents a colour it does not have.
- **Ramp floor matters as much as its ceiling.** Starting at 0.34 of the
  creature's lightness put its darkest mass within a few points of the
  battlefield background and the silhouette dissolved.

## Status — 2026-07-28

Battle sprite GENERATION is still **blocked**. Both routes re-verified today on
a trivial prompt (a red circle) with valid credentials — `codex login status`
reports "Logged in using ChatGPT", and the last successful generation was
2026-07-26:

- Route A → `billing_hard_limit_reached`
- Route B → `http 403 Forbidden` from the image service

Nothing about the prompt affects either. This is an account/entitlement issue on
the ChatGPT subscription and cannot be worked around from the repo.

**Route C ships in the meantime** — rigged pixel sprites, no art service needed.

The spec, the processor and its verification all exist and are proven against
real art (`kongrath.png` run through the pipeline as four frames produced a
clean cutout with feet aligned within 0px). The moment either route returns,
the pilot can run unchanged.
