// Real hand-generated (AI pixel-art) sprites for the 30 base species (2026-07-25).
// One image per species, adult-only — see CLAUDE.md's "adult-only" decision:
// generating every life stage independently produced worse art (chained
// identity-preservation across stages pulled adult faces toward "cute"), so
// every stage now just displays this same adult image; Elder/Retiree keep
// applying the existing aging CSS filter over it, same as Sprite.tsx already
// did for the old hand-drawn grids. Files live in `public/sprites/<id>.png`,
// 320x320 RGBA, trimmed to content + a small even margin.
// The 15 exclusive-body species (Draconic/Abyssal/Mythical) have NO entry
// here yet — they still fall back to the generic body-type pixel grid in
// sprites.ts. Not an oversight; real art for them is a follow-up pass.
export const SPECIES_ART: Partial<Record<string, string>> = {
  kongrath: '/sprites/kongrath.png',
  aegisox: '/sprites/aegisox.png',
  maneleo: '/sprites/maneleo.png',
  grivvel: '/sprites/grivvel.png',
  ursath: '/sprites/ursath.png',
  pinguox: '/sprites/pinguox.png',
  strixil: '/sprites/strixil.png',
  balaenix: '/sprites/balaenix.png',
  corvaan: '/sprites/corvaan.png',
  larkessa: '/sprites/larkessa.png',
  bruxaroo: '/sprites/bruxaroo.png',
  koalio: '/sprites/koalio.png',
  quokkade: '/sprites/quokkade.png',
  sylvaglide: '/sprites/sylvaglide.png',
  tazzik: '/sprites/tazzik.png',
  maelurk: '/sprites/maelurk.png',
  nautilux: '/sprites/nautilux.png',
  carcharun: '/sprites/carcharun.png',
  mantaris: '/sprites/mantaris.png',
  lanterix: '/sprites/lanterix.png',
  scarabrute: '/sprites/scarabrute.png',
  mantevoke: '/sprites/mantevoke.png',
  arachnyx: '/sprites/arachnyx.png',
  vespera: '/sprites/vespera.png',
  odonatra: '/sprites/odonatra.png',
  crocmaw: '/sprites/crocmaw.png',
  iguanor: '/sprites/iguanor.png',
  serpwyn: '/sprites/serpwyn.png',
  geckari: '/sprites/geckari.png',
  tortavos: '/sprites/tortavos.png',
}
