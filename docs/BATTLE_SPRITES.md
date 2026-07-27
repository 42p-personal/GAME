# Battle sprites — spec (v0.93)

Battle sprites are a **second, separate art set** from the painted portraits in
`public/sprites/`. Both stay.

| | Portrait set (existing) | Battle set (new) |
|---|---|---|
| Where | Ranch, Market, Bestiary, Hall of Fame | the field engine only |
| Size | 320×320 RGBA | **128×128 RGBA** |
| Pose | 3/4 hero pose, one frame | **strict side profile, 4 frames** |
| Style | painted, detailed | flat, chunky, readable at 40px |

The portraits are the best-looking thing in the game and are viewed large and
still — they are not being replaced. Battle sprites exist because *animating*
painted 320×320 art for 65 species is not affordable, and because a monster
seen at 40px on a busy field needs a bold silhouette, not detail.
Teamfight Manager does exactly this split.

## Frames

Four per species, `public/battle/<id>-<frame>.png`:

| Frame | Purpose | Direction |
|---|---|---|
| `idle` | standing, between actions | facing right |
| `walk1` | stride, near leg forward | facing right |
| `walk2` | stride, far leg forward | facing right |
| `strike` | committing an attack | facing right |

`walk1`/`walk2` alternate for the walk cycle. Everything else is done in code
rather than art:

- **facing left** — `scaleX(-1)`, so no mirrored art is generated
- **hurt** — a red tint + shake on the idle
- **KO** — rotate and fade the idle
- **cast wind-up** — hold `strike` for the move's `castTime`

## Hard rules

1. **Strict side profile, facing right.** Not 3/4. The field is viewed from the
   side and units cross it horizontally; a 3/4 pose reads as facing the camera
   and ruins the sense of direction.
2. **FOOT-ANCHORED, not bbox-centred.** Every frame is padded so the creature's
   feet sit on the same baseline and its body centre sits on the same vertical
   axis. This is the whole reason a walk cycle doesn't jitter — the existing
   portrait pipeline centres the bounding box, which would make each frame
   bounce. `tools/battle_sprite.py` handles this.
3. **Consistent scale within a species.** All four frames drawn at the same
   apparent size; the script does not rescale per frame.
4. **Bold silhouette, flat colour.** It must read at 40px against a painted
   backdrop. Detail below ~4px is wasted.
5. **No ground shadow, no scenery, no border.** The engine draws its own
   shadow so it can move with the sprite.

## Style wrapper

Appended to every subject prompt so the set stays coherent:

> simple 2D game sprite of a single creature in STRICT SIDE PROFILE facing
> RIGHT, full body, standing on flat ground, chunky readable silhouette, bold
> clean dark outline, flat cel-shaded colours, minimal interior detail,
> small-scale mobile battler sprite, plain solid pure-white background, no
> text, no logo, no border, no ground shadow, no scenery

## Pipeline

1. `codex exec` one frame at a time (see `image-gen-codex` skill)
2. `python3 tools/battle_sprite.py <raw> <out>` — white→transparent, trim,
   **foot-anchor**, pad to 128×128
3. Read the output and check it against its siblings before accepting

## Known risk

Each frame is generated independently, so consistency between frames is the
thing most likely to fail — colour drift, size drift, a different number of
limbs. That is exactly what the Kongrath pilot is for: if drift is bad at four
frames, the fallback is fewer frames (idle + strike only) with more of the
motion done procedurally in code.
