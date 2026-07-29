// A standalone demo of the tamerengine flow — DEPLOY on hexes, then watch a real
// simulateFieldBattle play back in the TamerArena. Reachable via the `?tamerarena`
// dev route (see main.tsx). NOT part of the tournament flow.
import { useMemo, useState } from 'react'
import { generateMonster } from '../monster'
import { simulateFieldBattle } from './engine'
import { FIELD_W, FIELD_H, Obstacle } from './types'
import { autoDeployByRole } from './hex'
import { Monster } from '../core'
import { TamerArena } from './TamerArena'
import { Deploy, DeployMonster, DeployResult } from './Deploy'

const OBSTACLES: Obstacle[] = [
  { x: FIELD_W / 2 - 1.4, y: 4.5, w: 2.8, h: 4.0 },
  { x: FIELD_W / 2 - 1.4, y: FIELD_H - 8.5, w: 2.8, h: 4.0 },
  { x: 11, y: FIELD_H / 2 - 1.4, w: 3.2, h: 2.8 },
  { x: FIELD_W - 14.2, y: FIELD_H / 2 - 1.4, w: 3.2, h: 2.8 },
  { x: 6, y: 2.5, w: 2.2, h: 2.2 },
  { x: FIELD_W - 8.2, y: FIELD_H - 4.7, w: 2.2, h: 2.2 },
]
const A_SPECIES = ['kongrath', 'maneleo', 'grivvel']
const B_SPECIES = ['aegisox', 'ursath', 'kongrath']
const NAME: Record<string, string> = { kongrath: 'Kongrath', maneleo: 'Maneleo', grivvel: 'Grivvel', aegisox: 'Aegisox', ursath: 'Ursath' }
const build = (sp: string, seed: string): Monster => generateMonster(seed, { speciesId: sp, train: 850 }) as Monster

export function TamerArenaDemo() {
  const [n, setN] = useState(1)
  const [deployed, setDeployed] = useState<DeployResult | null>(null)

  const teams = useMemo(() => {
    const seed = 'demo' + n
    const teamA = A_SPECIES.map((s, i) => build(s, seed + 'a' + i))
    const teamB = B_SPECIES.map((s, i) => build(s, seed + 'b' + i))
    return { seed, teamA, teamB }
  }, [n])

  const deployTeam: DeployMonster[] = A_SPECIES.map((s, i) => ({ id: 'A' + i, name: NAME[s], species: s }))

  const fight = useMemo(() => {
    if (!deployed) return null
    const { seed, teamA, teamB } = teams
    // The player's pre-battle orders ride on each monster's `.tactics` — this is
    // what the field decider reads, so the plan set on the deploy screen bites.
    const teamAO = teamA.map((m, i) => ({ ...m, tactics: deployed.tactics[i] }))
    // Enemy auto-deploys on its own hexes by role (sturdier = front).
    const placeB = autoDeployByRole('B', teamB.map((m) => ({ front: m.stats.CON + m.stats.STR - m.stats.INT - m.stats.WIS })))
    const speciesById: Record<string, string> = {}
    A_SPECIES.forEach((s, i) => (speciesById['A' + i] = s))
    B_SPECIES.forEach((s, i) => (speciesById['B' + i] = s))
    const result = simulateFieldBattle({ seed, teamA: teamAO, teamB, obstacles: OBSTACLES, placeA: deployed.placeA, placeB })
    return { result, speciesById }
  }, [deployed, teams])

  const reset = () => { setDeployed(null); setN((v) => v + 1) }

  return (
    <div style={{ minHeight: '100vh', background: '#12141b', color: '#e9ecf3', padding: '24px 16px' }}>
      <div style={{ maxWidth: 1160, margin: '0 auto' }}>
        <p style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: '#8a93a7', margin: '0 0 6px' }}>
          tamerengine · dev route
        </p>
        <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-.03em', margin: '0 0 4px' }}>
          {fight ? 'TamerArena' : 'Deploy your team'}
        </h1>
        <p style={{ color: '#8a93a7', margin: '0 0 18px', maxWidth: '62ch' }}>
          {fight
            ? 'A real simulateFieldBattle from your formation — notched HP/MP bars, buff/debuff rows, per-ability animations, hard collision.'
            : 'Drop each monster onto a hex to set your formation, then start the fight. Standalone — not wired into the game yet.'}
        </p>

        {!fight && <Deploy team={deployTeam} onStart={setDeployed} />}

        {fight && (
          <>
            <TamerArena result={fight.result} speciesById={fight.speciesById} obstacles={OBSTACLES} />
            <button
              onClick={reset}
              style={{ marginTop: 12, font: '600 12px/1 ui-monospace, monospace', letterSpacing: '.05em', textTransform: 'uppercase', color: '#e9ecf3', background: '#1b1f2a', border: '1px solid #2c3342', borderRadius: 6, padding: '10px 14px', cursor: 'pointer' }}
            >
              ⚔ New fight — redeploy
            </button>
          </>
        )}
      </div>
    </div>
  )
}
