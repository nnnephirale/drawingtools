/* ════════════════════════════════════════════════════════════════════
   brushes, presets, defaults
   ════════════════════════════════════════════════════════════════════ */
const SLIP_PRESETS = [
  { name: 'Porcelain', color: '#E4E1DA', gloss: .55, brk: .3,  speckle: 0,   grain: .35, shine: 1 },
  { name: 'Stoneware', color: '#D3C7B1', gloss: .3,  brk: .55, speckle: .6,  grain: .55, shine: 1 },
  { name: 'Celadon',   color: '#98B6A1', gloss: .9,  brk: .85, speckle: .05, grain: .2,  shine: 1 },
  { name: 'Terracotta',color: '#B05A39', gloss: .05, brk: .2,  speckle: .12, grain: .8,  shine: 1 },
  { name: 'Tenmoku',   color: '#111400', gloss: 1,   brk: .7,  speckle: 0,   grain: .56, shine: .81 },
  { name: 'Cobalt',    color: '#2B4893', gloss: .85, brk: .6,  speckle: .04, grain: .2,  shine: 1 },
  { name: 'Butter',    color: '#E5D093', gloss: .65, brk: .5,  speckle: .08, grain: .3,  shine: 1 },
  { name: 'Blush',     color: '#DFAA9B', gloss: .5,  brk: .45, speckle: .1,  grain: .35, shine: 1 },
  { name: 'Ink',       color: '#1A1918', gloss: .95, brk: .15, speckle: 0,   grain: .15, shine: 1 },
];
const METAL_PRESETS = [
  { name: 'Chrome',   c0: '#101215', c1: '#6F757B', c2: '#F6F7F8', sky: .39, rim: .86, contrast: 1,    brk: .15, rough: .08, grain: .7,  iri: 0 },
  { name: 'Silver',   c0: '#2C2F33', c1: '#A3A8AE', c2: '#FCFCFB', sky: .5,  rim: .9,  contrast: .95,  brk: .1,  rough: .12, grain: .5,  iri: 0 },
  { name: 'Mercury',  c0: '#15171A', c1: '#8E949B', c2: '#FFFFFF', sky: .4,  rim: .88, contrast: 1,    brk: .05, rough: 0,   grain: .12, iri: 0 },
  { name: 'Gold',     c0: '#2E1A04', c1: '#A87A2E', c2: '#FFF1C4', sky: .4,  rim: .85, contrast: 1,    brk: .15, rough: .1,  grain: .6,  iri: 0 },
  { name: 'Copper',   c0: '#2A1008', c1: '#A55A38', c2: '#FFDCC6', sky: .38, rim: .84, contrast: 1,    brk: .15, rough: .1,  grain: .6,  iri: 0 },
  { name: 'Rose',     c0: '#341A1A', c1: '#B5827C', c2: '#FFF1EC', sky: .4,  rim: .86, contrast: 1,    brk: .15, rough: .1,  grain: .5,  iri: 0 },
  { name: 'Gunmetal', c0: '#060708', c1: '#3B4047', c2: '#C6CBD2', sky: .22, rim: .7,  contrast: 1.1,  brk: .3,  rough: .14, grain: .8,  iri: 0 },
  { name: 'Oil',      c0: '#0C0D10', c1: '#737981', c2: '#FFFFFF', sky: .38, rim: .84, contrast: 1.05, brk: .15, rough: .06, grain: .5,  iri: .85 },
  { name: 'Comic',    c0: '#0A0A0A', c1: '#8A8A8A', c2: '#FFFFFF', sky: .92, rim: .06, contrast: 1.3,  brk: .95, rough: .1,  grain: .9,  iri: 0 },
];
// after Illustrator's 3D and Materials stones (Comet Pit Surface, Ominous Obsidian), plus in-betweens
const STONE_PRESETS = [
  { name: 'Comet Pit', color: '#8E8B86', pits: .85, facets: 0,   grit: .75, scale: 1,   relief: 1,   gloss: .06, shine: .6 },
  { name: 'Ketchup',   color: '#6F0000', pits: 0,   facets: .43, grit: .39, scale: .9,  relief: .39, gloss: 1,   shine: .22 },
  { name: 'Pumice',    color: '#CDC6B8', pits: 1,   facets: 0,   grit: .9,  scale: .5,  relief: .8,  gloss: 0,   shine: .4 },
  { name: 'Moon',      color: '#B7B4AE', pits: .6,  facets: 0,   grit: .45, scale: 1.7, relief: .7,  gloss: .03, shine: .5 },
  { name: 'Basalt',    color: '#3C3B3A', pits: .26, facets: .65, grit: .85, scale: 1.1, relief: 1.18, gloss: .05, shine: 1.06 },
  { name: 'Meteorite', color: '#2A2725', pits: .7,  facets: .35, grit: .3,  scale: 1.2, relief: 1,   gloss: .6,  shine: 1 },
];
// modelling clay after the plasticine reliefs: one colour, matte to waxy, lit by the board's light
const CLAY_PRESETS = [
  { name: 'Coral',      color: '#C9452F', gloss: .35, grain: .3,  glow: .6 },
  { name: 'Bone',       color: '#E6E1D6', gloss: .3,  grain: .25, glow: .35 },
  { name: 'Ochre',      color: '#D49A3E', gloss: .5,  grain: .25, glow: .55 },
  { name: 'Periwinkle', color: '#94A8DB', gloss: .25, grain: .2,  glow: .3 },
  { name: 'Cocoa',      color: '#6B3B27', gloss: .55, grain: .3,  glow: .3 },
  { name: 'Iris',       color: '#4A4DA6', gloss: .4,  grain: .25, glow: .4 },
  { name: 'Moss',       color: '#7D8D4B', gloss: .3,  grain: .35, glow: .4 },
];
const DEF = {
  slip: {
    size: 37, pressure: .84, speed: .15, tilt: .33, vary: .31, merge: .28, pool: .54, smooth: .92, end: 'drop', taper: 1.2,
    color: '#E4E1DA', gloss: .55, shine: 1, brk: .3, speckle: 0, grain: .35, vol: 1, edge: 20, light: 120, shadow: 0, preset: 'Porcelain',
  },
  metal: {
    size: 37, pressure: .84, speed: .15, tilt: .33, vary: .31, merge: .28, pool: .54, smooth: .92, end: 'drop', taper: 1.4,
    c0: '#101215', c1: '#6F757B', c2: '#F6F7F8', sky: .39, rim: .86, contrast: 1, brk: .15, rough: .08, grain: .7, shine: 1, iri: 0,
    vol: 1, edge: 60, light: 300, shadow: 0, preset: 'Chrome',
  },
  stone: {
    size: 37, pressure: .84, speed: .15, tilt: .33, vary: .31, merge: .28, pool: .54, smooth: .92, end: 'drop', taper: 1.2,
    color: '#8E8B86', pits: .85, facets: 0, grit: .75, scale: 1, relief: 1, gloss: .06, shine: .6,
    vol: 1.75, edge: 11, light: 120, shadow: 0, preset: 'Comet Pit',
  },
  // Edge past any radius keeps every stroke round all the way over: a rolled snake of clay, never a puddle
  clay: {
    size: 30, pressure: .7, speed: .1, tilt: .2, vary: .22, merge: .18, pool: .8, smooth: .92, end: 'drop', taper: 1.2,
    color: '#C9452F', gloss: .35, shine: 1, grain: .3, glow: .6, vol: 1, edge: 160, pipe: 1.2, light: 135, shadow: 0, preset: 'Coral',
  },
};
const GEOM = new Set(['size', 'pressure', 'speed', 'tilt', 'vary', 'merge', 'pool', 'smooth', 'end', 'taper', 'pipe']);
const BRUSHES = ['slip', 'metal', 'stone', 'clay'];
const TOOLS = ['slip', 'stone', 'clay'];      // brushes offered in the pill; Metal is retired until a better one, but old Metal layers still render
const NAMES = { slip: 'Slip', metal: 'Metal', stone: 'Stone', clay: 'Clay' };
const PRESETS = { slip: SLIP_PRESETS, metal: METAL_PRESETS, stone: STONE_PRESETS, clay: CLAY_PRESETS };
const BGS = [['Paper', '#F4F2EE'], ['Stone', '#E2DFD8'], ['Sand', '#CDBFAD'], ['Sage', '#7F9A7E'], ['Slate', '#6F747B'], ['Ink', '#161616'], ['Clear', 'none']];
/* The board's light (see 32-scene-light.js), kept with the drawing. New drawings get real shadows on paper;
   drawings from before scene light keep the look they were made with until it's turned on. */
const LIGHT_DEF = { shadows: true, angle: 135, height: 38, soft: .45, fill: .32, shade: 1, paper: 'paper' };
const LIGHT_OLD = { ...LIGHT_DEF, shadows: false, paper: 'plain' };
const BOARDS = [['4:3', 1600, 1200], ['1:1', 1400, 1400], ['3:4', 1200, 1600], ['16:9', 1920, 1080], ['9:16', 1080, 1920]];
const mergeA = m => lerp(4.5, 1.32, clamp(m, 0, 1));    // field peak / threshold. Lower peak = longer tails = more fusing
const ERASE_A = 2.2;

