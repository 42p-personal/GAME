// ─────────────────────────────────────────────────────────────────────────────
// BATTLE SPRITE (v0.93) — a monster that MOVES, built from the art we have.
//
// The plan was 6 hand-generated frames per species (docs/BATTLE_SPRITES.md).
// Both image-generation routes have been returning hard failures since
// 2026-07-27 (API billing cap; codex image service 403), so that set does not
// exist and cannot be made today. See docs/ART_PIPELINE.md.
//
// So there are TWO ways here to get a moving monster without one, and this
// file picks between them on a `mode` prop:
//
//   'portrait' — animate the existing 320px painting as one piece. Squash,
//                stretch, lean and recoil read as weight, and it needs no new
//                art at all. But a painting has no separable arms, so nothing
//                can ever actually swing.
//   'pixel'    — build the creature from PARTS at 48px and rotate the joints
//                (`pixelRig.ts`). Arms swing, legs stride, tails lag. This is
//                the one that answers "sprites with moving arms".
//
// ⚠️ Both are SUBSTITUTES, not replacements. When generation unblocks, real
// frames drop into `frameFor()` and every caller keeps working — the state
// machine, the facing and the layout do not change. Nothing else in the
// codebase needs to know which of the three is live.
//
// ⚠️ TRANSFORM COMPOSITION. Three nested elements, each owning exactly one job:
//   .bs        position on the field   (translate — set by the caller)
//   .bs-face   which way it looks      (scaleX ±1)
//   .bs-anim   what it is doing        (the keyframes)
// Collapsing these fights: a keyframe that sets `transform` wipes the facing
// flip, and the sprite silently snaps to facing right mid-animation.
import { UnitVisState } from './types'
import { FRAME, FRAMES_PER_ANIM, RIG_ANIMS, RigAnim, sheetUrl } from './pixelRig'

/** What the sprite is doing. Extends the engine's states with combat beats the
 *  event stream can drive but the tick snapshot does not carry. */
export type SpriteAction = UnitVisState | 'hurt' | 'attack'

/**
 * Which art the sprite is built from.
 *
 * `portrait` animates the existing 320px painting as ONE piece — it reads as
 * weight, but a painting has no separable arms, so nothing can ever swing.
 * `pixel` draws the creature from parts at 48px and rotates the joints, so arms
 * genuinely swing and legs genuinely stride. See `pixelRig.ts`.
 */
export type SpriteMode = 'portrait' | 'pixel'

export interface BattleSpriteProps {
  /** Species id — resolves to `public/sprites/<id>.png`. */
  speciesId: string
  action: SpriteAction
  /** 1 faces right, -1 faces left. Matches `FieldEvent` snapshot `facing`. */
  facing: 1 | -1
  /** Rendered height in px. Width follows the source's square aspect. */
  size?: number
  /** Position within a field container, in px. Omit to lay out normally. */
  x?: number
  y?: number
  /** 0–1. Tints toward grey as it drops, so a nearly-dead unit reads at a glance
   *  without needing its bar. */
  hpFrac?: number
  label?: string
  mode?: SpriteMode
}

/**
 * The art for one frame of one action.
 *
 * Today every action resolves to the same portrait and the motion comes from
 * CSS. This indirection is the seam: when the 6-frame sets exist, this function
 * starts returning `<id>-<frame>.png` and nothing above it changes.
 */
export function frameFor(speciesId: string, _action: SpriteAction): string {
  return `/sprites/${speciesId}.png`
}

export function BattleSprite({
  speciesId, action, facing, size = 96, x, y, hpFrac = 1, label, mode = 'portrait',
}: BattleSpriteProps) {
  const positioned = x !== undefined && y !== undefined
  if (mode === 'pixel') {
    return (
      <PixelSprite
        speciesId={speciesId} action={action} facing={facing} size={size}
        x={x} y={y} hpFrac={hpFrac} label={label}
      />
    )
  }
  return (
    <div
      className={`bs${positioned ? ' bs-abs' : ''}`}
      style={{
        width: size, height: size,
        ...(positioned ? { transform: `translate3d(${x - size / 2}px, ${y - size}px, 0)` } : null),
      }}
      title={label}
    >
      {/* A contact shadow does more for "standing on ground" than any amount of
          sprite detail — without it a floating cutout never sits in the scene. */}
      <div className="bs-shadow" />
      <div className="bs-face" style={{ transform: `scaleX(${facing})` }}>
        <div className={`bs-anim bs-${action}`}>
          <img
            src={frameFor(speciesId, action)}
            alt={label ?? speciesId}
            draggable={false}
            style={{
              // Wounded monsters desaturate rather than turning red — a red
              // tint reads as "on fire", which is a status we actually have.
              filter: hpFrac < 1 ? `saturate(${0.35 + hpFrac * 0.65})` : undefined,
            }}
          />
        </div>
      </div>
    </div>
  )
}

/**
 * The rigged sprite: one generated sheet, stepped by a CSS `steps()` animation
 * on `background-position`.
 *
 * ⚠️ `steps()` ON BACKGROUND-POSITION, NOT A PER-FRAME TIMER. A JS interval per
 * sprite would mean a dozen timers all re-rendering React on their own
 * schedule; this hands the whole thing to the compositor and costs nothing.
 *
 * ⚠️ And `image-rendering: pixelated` is not decoration. Without it the browser
 * smooths a 48px sheet up to display size and every hard-won pixel edge turns
 * to mush — the exact thing `quantise()` exists to produce.
 */
function PixelSprite({
  speciesId, action, facing, size, x, y, hpFrac = 1, label,
}: Omit<BattleSpriteProps, 'mode'> & { size: number }) {
  // The engine's states map 1:1 onto rig rows; the extra beats fall back.
  const anim: RigAnim = (RIG_ANIMS as string[]).includes(action)
    ? (action as RigAnim)
    : action === 'hurt' ? 'hurt' : 'idle'
  const row = RIG_ANIMS.indexOf(anim)
  const positioned = x !== undefined && y !== undefined
  // One-shot clips must not loop, or a corpse stands back up.
  const once = anim === 'attack' || anim === 'hurt' || anim === 'dead'
  const dur = anim === 'move' ? 0.5 : anim === 'idle' ? 2.4 : anim === 'dead' ? 0.8 : 0.42

  return (
    <div
      className={`bs${positioned ? ' bs-abs' : ''}`}
      style={{
        width: size, height: size,
        ...(positioned ? { transform: `translate3d(${x! - size / 2}px, ${y! - size}px, 0)` } : null),
      }}
      title={label}
    >
      <div className="bs-shadow" />
      <div className="bs-face" style={{ transform: `scaleX(${facing})` }}>
        <div
          className="bs-px"
          style={{
            backgroundImage: `url(${sheetUrl(speciesId)})`,
            backgroundSize: `${FRAMES_PER_ANIM * 100}% ${RIG_ANIMS.length * 100}%`,
            backgroundPositionY: `${(row / (RIG_ANIMS.length - 1)) * 100}%`,
            animation: `bs-steps ${dur}s steps(${FRAMES_PER_ANIM}) ${once ? '1 forwards' : 'infinite'}`,
            filter: hpFrac < 1 ? `saturate(${0.35 + hpFrac * 0.65})` : undefined,
            // See the keyframe: the end stop must be 100 × N/(N−1), not 100%.
            ['--bs-end' as string]: `${(100 * FRAMES_PER_ANIM) / (FRAMES_PER_ANIM - 1)}%`,
          }}
          // Re-keying on the action remounts the node, which is what restarts a
          // one-shot clip — without it a second hit landing during the first
          // would silently not replay.
          key={`${anim}-${speciesId}`}
          aria-label={label ?? speciesId}
          role="img"
        />
      </div>
    </div>
  )
}

export { FRAME as PIXEL_FRAME }
