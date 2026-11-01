/* Slip & Metal: every GLSL source, as plain strings. A classic script (not a module) so index.html still
   opens straight from disk; it loads first and the app reads window.SM_SHADERS.
   GL_H is the height chunk shared by the 2D material shader, the 3D mesh and the model export.
   fsComp(mesh) builds the material shader; mesh = true compiles the 3D view's variant (#define MESH). */
window.SM_SHADERS = (() => {
'use strict';

const VS_FULL = `#version 300 es
const vec2 P[3] = vec2[3](vec2(-1.,-1.), vec2(3.,-1.), vec2(-1.,3.));
out vec2 vUv;
void main(){ vec2 p = P[gl_VertexID]; vUv = p*.5+.5; gl_Position = vec4(p,0.,1.); }`;

const VS_STAMP = `#version 300 es
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 aStamp;   // x, y, sigma, weight (doc px)
layout(location=2) in float aR;      // stroke radius at this stamp
uniform vec2 uDoc; uniform float uMinSigma;
out vec2 vD; out float vW; out float vR;
void main(){
  float s = max(aStamp.z, uMinSigma);
  vD = aCorner * 3.2;
  vW = aStamp.w; vR = aR;
  vec2 p = aStamp.xy + aCorner * s * 3.2;
  vec2 c = p / uDoc * 2. - 1.;
  gl_Position = vec4(c.x, -c.y, 0., 1.);
}`;
const FS_STAMP = `#version 300 es
precision highp float;
in vec2 vD; in float vW; in float vR;
uniform float uScale;
out vec4 o;
void main(){
  float d2 = dot(vD, vD);
  float k = exp(-.5*d2) * (1. - smoothstep(6.76, 10.24, d2));
  float f = vW * k * uScale;
  // radius weighted by radius (b / g): where a wedge's hair-thin end lies inside a fat blob, a plain average
  // would let the many thin stamps drag the blob's radius, and its height, down into a pit
  o = vec4(f, f * vR / 64., f * vR * vR / 4096., 0.);
}`;
const FS_COPY = `#version 300 es
precision highp float; in vec2 vUv; uniform sampler2D uSrc; out vec4 o;
void main(){ o = texture(uSrc, vUv); }`;
const FS_ERASE = `#version 300 es
precision highp float; in vec2 vUv; uniform sampler2D uSrc, uE; uniform float uInv; out vec4 o;
void main(){ vec4 f = texture(uSrc, vUv); float e = texture(uE, vUv).r * uInv; o = vec4(f.rgb * clamp(1. - e, 0., 1.), 0.); }`;
/* Scene light. Everything on the board shares one key light and one sky. Three small buffers (half the field's
   resolution, in the board's uv) carry what a single layer can't know on its own:
   - heights: every visible layer's height summed (doc px), mipmapped, so blurred heights are one fetch away;
   - colours: the backdrop with each layer's colour laid over it, mipmapped: what a surface sees around it,
     for bounce light (red clay warms the paper beside it, green paper tints the clay's lower walls);
   - light: per texel, how much of the key light gets through (cast shadow) and how open the sky is (occlusion).
   The ground and every layer read them back in one or two fetches. */
const PAPER_GLSL = `
float phash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float pnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(phash(i), phash(i+vec2(1,0)), f.x), mix(phash(i+vec2(0,1)), phash(i+vec2(1,1)), f.x), f.y); }
float pfbm(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 4; i++){ s += a * pnoise(p); p = p * 2.03 + 17.1; a *= .5; } return s; }
// paper at doc px p: xy = slope of the sheet (for its normal), z = tone (multiplies the colour)
vec3 paper(vec2 p, vec2 docSz, int kind, float seed){
  if (kind == 0) return vec3(0., 0., 1.);
  vec2 s = vec2(seed * 7.1, seed * 3.3);
  float e = .7;
  // formation: the cloudy unevenness of pulp, and short fibres at ~1 px
  float form = pfbm(p / 11. + s) - .5;
  float fib = pnoise(vec2(p.x * .9 + p.y * .4, p.y * .9 - p.x * .4) / 1.3 + s) - .5;
  float tone = 1. + form * .07 + fib * .035 + (phash(floor(p * 1.1) + s) - .5) * .025;
  // tooth: the grain the light rakes across
  vec2 g = vec2(pnoise((p + vec2(e, 0.)) / 2. + s) - pnoise((p - vec2(e, 0.)) / 2. + s),
                pnoise((p + vec2(0., e)) / 2. + s) - pnoise((p - vec2(0., e)) / 2. + s)) * .065;
  // cockle: a sheet is never quite flat
  float c0 = pfbm(p / 260. + s * .1);
  g += vec2(pfbm((p + vec2(9., 0.)) / 260. + s * .1) - c0, pfbm((p + vec2(0., 9.)) / 260. + s * .1) - c0) * .55;
  if (kind == 2) {
    // folded in four and opened out: a valley down the middle, a ridge across it, every panel tilted a little
    vec2 c = docSz * .5 + vec2(pnoise(vec2(p.y / 90., seed)) - .5, pnoise(vec2(p.x / 90., seed + 4.)) - .5) * 5.;
    vec2 d = p - c;
    // tanh of a large number overflows to NaN on Apple GPUs (exp(2x) / exp(2x)): clamp it first
    g.x += -.045 * tanh(clamp(d.x / 2.2, -8., 8.)) * (1. - .25 * smoothstep(0., docSz.y * .5, abs(d.y)));
    g.y += .03 * tanh(clamp(d.y / 2.2, -8., 8.)) * (1. - .25 * smoothstep(0., docSz.x * .5, abs(d.x)));
    float crush = exp(-d.x * d.x / 3.) + .8 * exp(-d.y * d.y / 3.);
    tone *= 1. - .06 * crush * (.6 + .8 * pnoise(p / 3. + s));
  }
  return vec3(g, tone);
}`;
/* Reading the scene light (see FS_LIGHT), shared by the ground, the layers and the light buffer itself.
   Occlusion is computed right where it's needed from the blurred heights: trilinear mips are smooth, so it
   never traces the half-res grid. The cast shadow comes from the light buffer, which holds two values per
   texel: the light on top of whatever stands there (r, at height b) and the light at paper level, ignoring
   what stands on that very spot (g). Every point reads r from the texels whose height matches its own: read
   plainly, a stroke's rim would take the paper's shadow and the paper beside it the stroke's (a dark outline,
   jagged on the half-res grid). Where none matches, it takes g. */
const SCENE_GLSL = `
uniform sampler2D uSH;
uniform float uTexDoc;        // doc px per scene texel
uniform vec3 uSL;             // towards the key light, doc frame (y down)
uniform float uSoft;          // tan of the light's angular radius
uniform float uReach;         // the longest a shadow can fall (doc px)
uniform int uSteps;           // 0: no cast shadow
uniform vec2 uLBTexel;
float shash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
// how open the sky is at height z: how far the blurred heights around rise above it, from contact to broad
float sceneAO(vec2 uv, float z){
  float occ = 0., ws = 0.;
  // from the second level up, each ramping over twice its own width: finer, or saturating within a texel,
  // the contact band follows the half-res texel staircase along every diagonal outline
  for (int l = 2; l <= 7; l++) {
    float fl = float(l), r = uTexDoc * exp2(fl) * 1.6, w = 1.8 / (fl - .5);
    occ += w * smoothstep(0., 1., (textureLod(uSH, uv, fl).r - z) / r); ws += w;
  }
  // eased, never clipped: a clipped floor reads as a flat dark band hugging every outline
  return 1. - .62 * (1. - exp(-2.4 * occ / ws));
}
// the key light reaching height z at uv: march towards the light over the summed heights. The ray's closest
// pass over anything in the way, over how far along it is, is the penumbra: wide far from the occluder, sharp
// where it touches. Further out it reads blurrier heights, as a cone from a light of real size would.
float sceneVis(vec2 uv, float z, int steps, float j, vec2 docSz, float t0){
  if (steps <= 0) return 1.;
  vec2 duv = normalize(vec2(uSL.x, -uSL.y) + 1e-6) / docSz;
  float tanE = uSL.z / max(length(uSL.xy), 1e-4), n = float(steps), vis = 1.;
  for (int i = 0; i < 64; i++) {
    if (i >= steps) break;
    float f = (float(i) + j) / n;
    float t = uTexDoc * t0 + uReach * f * f;
    vec2 q = uv + duv * t;
    if (q.x < 0. || q.y < 0. || q.x > 1. || q.y > 1.) break;
    float lod = clamp(log2(max(t * uSoft * .6 / uTexDoc, 1.)), 0., 4.);
    vis = min(vis, (z + t * tanE - textureLod(uSH, q, lod).r + uTexDoc * .35) / (t * uSoft));
    if (vis <= 0.) break;
  }
  vis = clamp(vis, 0., 1.);
  return vis * vis * (3. - 2. * vis);
}
float keyVis(sampler2D lb, vec2 uv, float z){
  if (uSteps <= 0) return 1.;
  vec2 p = uv / uLBTexel - .5, f = fract(p), b = (floor(p) + .5) * uLBTexel;
  vec4 s00 = texture(lb, b), s10 = texture(lb, b + vec2(uLBTexel.x, 0.)), s01 = texture(lb, b + vec2(0., uLBTexel.y)), s11 = texture(lb, b + uLBTexel);
  vec4 w = vec4((1. - f.x) * (1. - f.y), f.x * (1. - f.y), (1. - f.x) * f.y, f.x * f.y)
         * exp(-abs(vec4(s00.b, s10.b, s01.b, s11.b) - z) / (2. + z * .15));
  float ws = w.x + w.y + w.z + w.w;
  if (ws < .01) return texture(lb, uv).g;     // none at this height (paper tucked under an outline): paper level
  return dot(vec4(s00.r, s10.r, s01.r, s11.r), w) / ws;
}`;
const FS_BG = `#version 300 es
precision highp float; in vec2 vUv;
uniform vec3 uBg; uniform int uImg; uniform sampler2D uTex; uniform vec4 uView; uniform vec2 uDoc;
uniform int uPaper; uniform float uSeed;
uniform int uLit;                       // 1: the scene buffers are there to read
uniform sampler2D uLB, uSA;
uniform vec3 uKeyC, uSkyC, uOpenC;
uniform float uBleedLod, uShade;
uniform int uClear;                     // a transparent board: only the shade, as darkness
out vec4 o;
${PAPER_GLSL}
${SCENE_GLSL}
void main(){
  vec2 uv = uView.xy + vUv * uView.zw;       // uView: the part of the board on the canvas (all of it, but in close-up)
  if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) { o = vec4(0.); return; }
  vec3 c = uImg == 1 ? texture(uTex, vec2(uv.x, 1. - uv.y)).rgb : uBg;
  if (uLit == 0 && uPaper == 0) { o = uClear == 1 ? vec4(0.) : vec4(c, 1.); return; }
  vec2 doc = vec2(uv.x, 1. - uv.y) * uDoc;
  vec3 pp = paper(doc, uDoc, uPaper, uSeed);
  vec3 alb = pow(c, vec3(2.2)) * pp.z;
  vec3 N = normalize(vec3(-pp.xy, 1.));
  float vis = 1., ao = 1.;
  vec3 bounce = vec3(0.);
  if (uLit == 1) {
    vis = keyVis(uLB, uv, 0.);
    float a0 = sceneAO(uv, 0.);
    ao = mix(1., a0, uShade);
    // light thrown back by whatever stands close by, in its colour
    bounce = textureLod(uSA, uv, uBleedLod).rgb * (1. - a0) * .45 * uShade * uOpenC;
  }
  vec3 E = uKeyC * max(dot(N, uSL), 0.) * vis + uSkyC * ao + bounce;
  if (uClear == 1) { o = vec4(0., 0., 0., 1. - clamp(dot(E / uOpenC, vec3(.2126, .7152, .0722)), 0., 1.)); return; }
  vec3 col = alb * E / uOpenC;
  col = col / (1. + max(col - 1., 0.));
  o = vec4(pow(max(col, 0.), vec3(1. / 2.2)), 1.);
}`;

/* The material shader. The field texture holds R = summed gaussian density, G = density × radius, B = density × radius²
   (the local radius is B / G, so thin stamps can't drag a fat one's radius down).
   Surface = where R > 1. From R we recover the distance to the silhouette, then build the height as a
   quarter-circle bevel of radius Edge: thin lines come out round, wide pools and merges go flat on top,
   like a liquid held by surface tension (the reference brushes' puddles).
   The height is shared with the 3D view's mesh and the model export, so it lives in its own chunk. */
const GL_H = `
precision highp sampler2D;
uniform sampler2D uField;
uniform float uInv, uA, uBevel, uBulge;
uniform vec2 uDoc;
// x = summed density R, y = the local radius (doc px)
vec2 F(vec2 uv){ vec4 t = texture(uField, uv); return vec2(t.r * uInv, t.b / max(t.g, 1e-7) * 64.); }
float lnA;
// 0 at the silhouette, 1 on the ridge of a lone line (exact for a straight gaussian ridge)
float innerE(float R){ return R >= uA ? 1. : 1. - sqrt(max(log(uA / R) / lnA, 0.)); }
float H(vec2 uv){
  vec2 f = F(uv);
  if (f.x <= 1.) return 0.;
  float rad = f.y;
  float over = max(f.x / uA - 1., 0.);
  float B = max(min(rad, uBevel), .5);
  float d = innerE(f.x) * rad + over * rad * .6;
  float t = min(d / B, 1.);
  return B * sqrt(1. - (1. - t) * (1. - t)) + uBulge * rad * min(over, 1.2) * .3;
}
// 0 at the board's edge, 1 a bevel's width in: a stroke that runs off the board closes there like at its outline
float edgeT(vec2 uv){ vec2 d = min(uv, 1. - uv) * uDoc; return clamp(min(d.x, d.y) / uBevel, 0., 1.); }
/* The same form for geometry. The bevel above meets the board with a vertical wall, which a grid can't follow:
   one vertex outside, the next already high, and the silhouette lands at a different height in every cell
   (a comb along each stroke once tilted). Here the wall has a finite slope and carries on below the board
   outside the stroke (the distance is signed), so every triangle crosses zero right at the silhouette. */
float Hg(vec2 uv){
  vec2 f = F(uv);
  if (f.x <= .02) return -2. * uBevel;
  float rad = f.y;
  float over = max(f.x / uA - 1., 0.);
  float B = max(min(rad, uBevel), .5);
  float t = clamp((innerE(f.x) * rad + over * rad * .6) / B, -1., 1.);
  float te = edgeT(uv);
  return min(B * (t < 0. ? 2. * t : 1. - (1. - t) * (1. - t)) + uBulge * rad * min(over, 1.2) * .3, uBevel * (1. - (1. - te) * (1. - te)));
}
// the bevel, also closed off at the board's edge (for the 3D view's shading)
float Hc(vec2 uv){ float te = edgeT(uv); return min(H(uv), uBevel * sqrt(1. - (1. - te) * (1. - te))); }`;

/* One visible layer into the scene buffers: its surface (uMode 0), its colour where it covers (1), the backdrop
   the colours start from (2), or what it will stand on (3). A layer stands on the layers below blurred over about
   its own radius, so a snake laid across another drapes over it and down, instead of stepping off a cliff (and
   shadowing itself where it does). Its surface is laid over the heights so far like paint: where it covers,
   the top is its base plus its own height. */
const FS_SCENE = `#version 300 es
precision highp float; in vec2 vUv;
${GL_H}
uniform int uMode; uniform float uK, uLift, uLod; uniform vec3 uCol; uniform int uImg; uniform sampler2D uTex;
uniform sampler2D uBase; uniform vec4 uBaseCh;
out vec4 o;
void main(){
  if (uMode == 2) { vec3 c = uImg == 1 ? texture(uTex, vec2(vUv.x, 1. - vUv.y)).rgb : uCol; o = vec4(pow(c, vec3(2.2)), 1.); return; }
  if (uMode == 3) { o = vec4(textureLod(uTex, vUv, uLod).r); return; }
  lnA = log(uA);
  // a rolled snake of clay is a whole cylinder lying on the board: what we see is its upper half, standing on a
  // lower half that's tucked out of sight. uLift adds that hidden half (one radius) so it casts like one.
  if (uMode == 0) { vec2 f = F(vUv); float on = step(1., f.x);         // a clean step: a texel is ground or stroke, never between
    float top = (H(vUv) + uLift * f.y) * uK + dot(texture(uBase, vUv), uBaseCh);
    o = vec4(top * on, 0., 0., on); return; }
  float a = clamp((F(vUv).x - 1.) * 3. + .5, 0., 1.);
  o = vec4(uCol * a, a);
}`;
// the light buffer: per scene texel, the key light on top of whatever stands there (r), at paper level (g), that height (b)
const FS_LIGHT = `#version 300 es
precision highp float; in vec2 vUv;
uniform vec2 uDoc;
${SCENE_GLSL}
out vec4 o;
void main(){
  float z0 = textureLod(uSH, vUv, 0.).r, j = shash(gl_FragCoord.xy);
  // paper texels start a texel and a half out: on the half-res grid every outline is a staircase, and a paper
  // texel tucked into one of its steps would otherwise shadow itself on the stroke right beside it (dots)
  float top = sceneVis(vUv, z0, uSteps, j, uDoc, z0 > .5 ? .8 : 1.5);
  // at paper level under a stroke, start the ray past the stroke's own edge: what reaches the paper just beside it
  o = vec4(top, z0 > .5 ? sceneVis(vUv, 0., uSteps, j, uDoc, 4.) : top, z0, 1.);
}`;
// mesh = the 3D view: V comes from the real camera, and a depth pre-pass (uPass 0) lays down the solid part
const fsComp = mesh => `#version 300 es
precision highp float;
${mesh ? '#define MESH' : ''}
in vec2 vUv;
#ifdef MESH
in vec3 vP;
uniform vec3 uCam; uniform int uPass; uniform mat3 uRot; uniform float uSide, uDepth;
// textures are sampled at the surface's 3D position (TX), and every direction is turned into the room (OW)
#define TX vec3
#define OW(v) (uRot * (v))
#define SPECK .4
#else
#define TX vec2
#define OW(v) (v)
#define SPECK .2
uniform vec4 uView;   // the part of the board on the canvas: (0,0,1,1) but in close-up
#endif
${GL_H}
uniform vec2 uRes;
uniform float uVol;
uniform vec3 uL;
uniform int uBrush;
uniform vec3 uC0, uC1, uC2;
uniform float uGloss, uShine, uBreak, uSpeckle, uGrain, uRough, uContrast, uIri, uShadow, uShadowDist, uSeed, uSky, uRim;
uniform float uPits, uFacets, uDScale, uRelief, uGlow;
// scene light (FS_LIGHT): uLit 0 = none, 1 = shadow and occlusion, 2 = occlusion only (the 3D view, where the
// room's light turns with the camera and a shadow baked on the board would point the wrong way)
uniform int uLit; uniform sampler2D uLB, uSA; uniform vec3 uKeyC, uSkyC, uOpenC, uBgC; uniform float uEnvLod, uShade;
uniform sampler2D uBase; uniform vec4 uBaseCh;      // what this layer stands on: the layers below, summed (one channel)
out vec4 o;
${SCENE_GLSL}

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 4; i++){ s += a * vnoise(p); p = p * 2.03 + 17.1; a *= .5; } return s; }
/* integer hash for lattice features. A float hash of (cell + offset + seed) can differ by a rounding step
   depending on which neighbouring pixel cell evaluates it (Metal's fast-math reassociates), and that
   clips craters along cell lines. Integers hash identically from every side. */
float ihash(ivec2 c, int k){
  uvec2 q = uvec2(c + ivec2(k * 7919, k * 104729)) * uvec2(1597334673u, 3812015801u);
  return float(((q.x ^ q.y) * 1597334673u) >> 8) / 16777216.;
}
vec2 ihash2(ivec2 c, int k){ return vec2(ihash(c, k), ihash(c, k + 31)); }
// value noise with its analytic gradient (x = value, yz = d/dp)
vec3 noised(vec2 p){ vec2 i = floor(p), f = fract(p), u = f*f*(3.-2.*f), du = 6.*f*(1.-f);
  float a = hash(i), b = hash(i+vec2(1,0)), c = hash(i+vec2(0,1)), d = hash(i+vec2(1,1));
  return vec3(a + (b-a)*u.x + (c-a)*u.y + (a-b-c+d)*u.x*u.y, du * (vec2(b-a, c-a) + (a-b-c+d)*u.yx)); }

/* Stone relief, after Illustrator's Comet Pit Surface and Ominous Obsidian. Every layer returns
   height (doc px) and its gradient, so it adds straight onto the inflate's normal with no extra taps. */
// craters: some cells hold a steep-walled bowl with a raised lip. w = how deep inside a bowl (0..1)
vec4 craters(vec2 p, float cs, float dens, float depth, int s){
  vec2 g = p / cs, f = fract(g);
  ivec2 i = ivec2(floor(g));
  vec4 acc = vec4(0.);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    ivec2 id = i + ivec2(x, y);
    vec2 o = vec2(x, y);
    float on = step(ihash(id, s + 7), dens);
    vec2 d = f - o - (.15 + .7 * ihash2(id, s));
    float r = mix(.2, .55, ihash(id, s + 3));
    float l = length(d), u = l / r, inb = step(u, 1.);
    float lip = exp(-(u - 1.) * (u - 1.) / .05);
    float hh = inb * (.5 * (u*u + u*u*u*u) - 1.) + .28 * lip;
    float dh = inb * (u + 2. * u*u*u) - .28 * lip * 2. * (u - 1.) / .05;
    acc.x += on * hh * r * cs * depth;
    acc.yz += on * dh * depth * d / max(l, 1e-4);
    acc.w = max(acc.w, on * inb * (1. - u*u));
  }
  return acc;
}
// conchoidal fracture: each cell is a shallow elongated scoop (height ∝ squared distance to its centre),
// so neighbouring scoops meet in sharp ridges, with faint rings like a struck flint. w = 0 at a scoop centre.
// The metric only ever stretches (e ≥ 1, capped at 1.6), which keeps the true nearest scoop inside a 5×5 search:
// a narrower search lets a far, stretched scoop win in some cells and not others, leaving straight seams.
vec4 scoops(vec2 p, float cs, float depth, int s){
  vec2 g = p / cs, f = fract(g);
  ivec2 i = ivec2(floor(g));
  float d1 = 99.; vec2 v1 = vec2(0.), tl = vec2(0.);
  for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
    ivec2 id = i + ivec2(x, y);
    vec2 o = vec2(x, y);
    vec2 d = f - o - (.1 + .8 * ihash2(id, s));
    float an = ihash(id, s + 9) * 6.2832, e = mix(1., 1.6, ihash(id, s + 5));
    mat2 Rm = mat2(cos(an), sin(an), -sin(an), cos(an));
    vec2 q = Rm * d; q.x *= e;
    float dd = dot(q, q);
    if (dd < d1) { d1 = dd; v1 = 2. * transpose(Rm) * vec2(q.x * e, q.y); tl = ihash2(id, s + 13) * 2. - 1.; }
  }
  // each chip is a gently dished plane with its own tilt, so whole facets flash at once like struck glass
  float sq = sqrt(d1) + 1e-4, ring = .0015 * cs * depth;
  vec2 gr = v1 * depth * .55 + tl * depth * .9 + ring * cos(sq * 22.) * 22. * v1 / (2. * sq) / cs;
  return vec4(d1 * cs * depth + ring * sin(sq * 22.), gr, d1);
}
vec3 stoneRelief(vec2 p, out float cav, out float bite){
  float sc = uDScale, s = uSeed * 7.;
  int si = int(uSeed * 97.);
  vec3 r = vec3(0.); cav = 0.; bite = 0.;
  if (uPits > 0.) {
    // warp the crater lattice so bowls come out lumpy and irregular rather than machined circles
    vec2 wq = p / (14. * sc) + s;
    vec2 cp = p + 6. * sc * (vec2(fbm(wq), fbm(wq + 8.3)) - .5);
    vec4 a = craters(cp, 58. * sc, .6 * uPits, .8, si);
    vec4 b = craters(cp + 31.7, 21. * sc, .45 * uPits, .7, si + 101);
    vec4 c = craters(cp + 77.1, 6. * sc, .22 * uPits, 1.1, si + 211);
    r += a.xyz + b.xyz + c.xyz;
    cav = max(max(a.w, b.w * .85), c.w);
    bite += uPits * .45 * max(a.w, b.w * .6);
  }
  if (uFacets > 0.) {
    vec2 wp = p + 12. * sc * (vec2(vnoise(p / (70. * sc) + s), vnoise(p / (70. * sc) + s + 5.2)) - .5);
    vec4 a = scoops(wp, 90. * sc, .55 * uFacets, si + 307);
    vec4 b = scoops(wp + 13.3, 30. * sc, .3 * uFacets, si + 401);
    r += a.xyz + b.xyz * .3;
    bite += uFacets * .3 * (1. - smoothstep(0., .3, a.w));
  }
  if (uGrain > 0.) {                                                // grit: a few octaves of fine pocking
    float fq = 1. / (5. * sc), amp = 1.8 * sc * uGrain;
    for (int k = 0; k < 4; k++) { vec3 n = noised(p * fq + s + float(k) * 13.7); r += vec3(n.x * amp, n.yz * amp * fq); fq *= 2.1; amp *= .5; }
  }
  return r * vec3(uRelief, uRelief, uRelief);
}
// a small studio for glossy stone: one softbox along the light, a long strip, a faint card opposite, dim ceiling
float stoneEnv(vec3 Rr, vec3 L, float g){
  float key = smoothstep(mix(.55, .93, g), mix(.75, .975, g), dot(Rr, L));
  vec2 Lxy = normalize(L.xy + 1e-5);
  float az = dot(normalize(Rr.xy + 1e-5), Lxy);
  float strip = (1. - smoothstep(0., mix(.3, .05, g), abs(Rr.z - L.z))) * smoothstep(.3, .9, az);
  float card = smoothstep(.2, .9, -az) * (1. - smoothstep(0., .3, abs(Rr.z - .35))) * .15;
  return key * 1.6 + strip * .7 + card + .025 * max(Rr.z, 0.) + .004;   // dark floor: steep walls stay black
}

#ifdef MESH
/* Solid versions for the 3D view. The 2D patterns live in the drawing's plane, so on a tilted wall they
   smear straight down it like a slit-scan. These live in space: the surface slices through them, so pits,
   chips, grit and speckle look the same on a top, a wall or the back. */
float hash(vec3 p){ p = fract(p * vec3(123.34, 456.21, 789.92)); p += dot(p, p.yzx + 45.32); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x), mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x), mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p){ float s = 0., a = .5; for (int i = 0; i < 4; i++){ s += a * vnoise(p); p = p * 2.03 + 17.1; a *= .5; } return s; }
float ihash(ivec3 c, int k){
  uvec3 q = uvec3(c + ivec3(k * 7919, k * 104729, k * 15485863)) * uvec3(1597334673u, 3812015801u, 2798796415u);
  return float(((q.x ^ q.y ^ q.z) * 1597334673u) >> 8) / 16777216.;
}
vec3 ihash3(ivec3 c, int k){ return vec3(ihash(c, k), ihash(c, k + 31), ihash(c, k + 57)); }
// value noise with its analytic gradient (x = value, yzw = d/dp)
vec4 noised(vec3 x){ vec3 i = floor(x), f = fract(x), u = f*f*(3.-2.*f), du = 6.*f*(1.-f);
  float a = hash(i), b = hash(i+vec3(1,0,0)), c = hash(i+vec3(0,1,0)), d = hash(i+vec3(1,1,0));
  float e = hash(i+vec3(0,0,1)), g = hash(i+vec3(1,0,1)), hh = hash(i+vec3(0,1,1)), k = hash(i+vec3(1,1,1));
  float k1 = b-a, k2 = c-a, k3 = e-a, k4 = a-b-c+d, k5 = a-c-e+hh, k6 = a-b-e+g, k7 = -a+b+c-d+e-g-hh+k;
  return vec4(a + k1*u.x + k2*u.y + k3*u.z + k4*u.x*u.y + k5*u.y*u.z + k6*u.z*u.x + k7*u.x*u.y*u.z,
    du * vec3(k1 + k4*u.y + k6*u.z + k7*u.y*u.z, k2 + k5*u.z + k4*u.x + k7*u.z*u.x, k3 + k6*u.x + k5*u.y + k7*u.x*u.y)); }
// craters as spherical bowls in a 3D lattice: a surface passing through one at any depth shows a pit of that size.
// Centres stay in the middle half of their cell and bowls (with lip) reach .63 of a cell, so only the 2×2×2
// cells on this point's side can touch it: 8 lookups instead of 27.
vec4 craters(vec3 p, float cs, float dens, float depth, int s, out float w){
  vec3 g = p / cs, fl = floor(g), f = g - fl;
  ivec3 i = ivec3(fl), o0 = ivec3(step(.5, f)) - 1;
  vec4 acc = vec4(0.); w = 0.;
  for (int z = 0; z <= 1; z++) for (int y = 0; y <= 1; y++) for (int x = 0; x <= 1; x++) {
    ivec3 oc = o0 + ivec3(x, y, z), id = i + oc;
    float on = step(ihash(id, s + 7), dens);
    vec3 d = f - vec3(oc) - (.25 + .5 * ihash3(id, s));
    float r = mix(.2, .45, ihash(id, s + 3));
    float l = length(d), u = l / r, inb = step(u, 1.);
    float lip = exp(-(u - 1.) * (u - 1.) / .05);
    float hh = inb * (.5 * (u*u + u*u*u*u) - 1.) + .28 * lip;
    float dh = inb * (u + 2. * u*u*u) - .28 * lip * 2. * (u - 1.) / .05;
    acc.x += on * hh * r * cs * depth;
    acc.yzw += on * dh * depth * d / max(l, 1e-4);
    w = max(w, on * inb * (1. - u*u));
  }
  return acc;
}
// conchoidal chips: 3D Voronoi cells, each a dished plane with its own tilt. w = squared distance to the centre
vec4 scoops(vec3 p, float cs, float depth, int s, out float w){
  vec3 g = p / cs, f = fract(g);
  ivec3 i = ivec3(floor(g));
  float d1 = 99.; vec3 v1 = vec3(0.), tl = vec3(0.);
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    ivec3 id = i + ivec3(x, y, z);
    vec3 d = f - vec3(x, y, z) - (.1 + .8 * ihash3(id, s));
    float dd = dot(d, d);
    if (dd < d1) { d1 = dd; v1 = 2. * d; tl = ihash3(id, s + 13) * 2. - 1.; }
  }
  float sq = sqrt(d1) + 1e-4, ring = .0015 * cs * depth;
  w = d1;
  return vec4(d1 * cs * depth + ring * sin(sq * 22.), v1 * depth * .55 + tl * depth * .9 + ring * cos(sq * 22.) * 22. * v1 / (2. * sq) / cs);
}
vec4 stoneRelief(vec3 p, out float cav, out float bite){
  float sc = uDScale, s = uSeed * 7.;
  int si = int(uSeed * 97.);
  vec4 r = vec4(0.); cav = 0.; bite = 0.;
  if (uPits > 0.) {
    vec3 wq = p / (14. * sc) + s;                     // two octaves of warp are plenty for lumpy rims
    vec3 cp = p + 6. * sc * (vec3(vnoise(wq) + .5 * vnoise(wq * 2.03 + 17.1), vnoise(wq + 8.3) + .5 * vnoise(wq * 2.03 + 25.4),
                                  vnoise(wq + 4.1) + .5 * vnoise(wq * 2.03 + 21.2)) / 1.5 - .5);
    // a surface only meets the bowls it passes through, so the lattice is fuller than the 2D one
    float wa, wb, wc;
    vec4 a = craters(cp, 58. * sc, min(1., uPits), .8, si, wa);
    vec4 b = craters(cp + 31.7, 21. * sc, min(1., .75 * uPits), .7, si + 101, wb);
    vec4 c = craters(cp + 77.1, 6. * sc, min(1., .37 * uPits), 1.1, si + 211, wc);
    r += a + b + c;
    cav = max(max(wa, wb * .85), wc);
    bite += uPits * .45 * max(wa, wb * .6);
  }
  if (uFacets > 0.) {
    vec3 q = p / (70. * sc) + s;
    vec3 wp = p + 12. * sc * (vec3(vnoise(q), vnoise(q + 5.2), vnoise(q + 2.9)) - .5);
    float w1, w2;
    vec4 a = scoops(wp, 90. * sc, .55 * uFacets, si + 307, w1);
    vec4 b = scoops(wp + 13.3, 30. * sc, .3 * uFacets, si + 401, w2);
    r += a + b * .3;
    bite += uFacets * .3 * (1. - smoothstep(0., .3, w1));
  }
  if (uGrain > 0.) {
    float fq = 1. / (5. * sc), amp = 1.8 * sc * uGrain;
    for (int k = 0; k < 4; k++) { vec4 n = noised(p * fq + s + float(k) * 13.7); r += vec4(n.x * amp, n.yzw * amp * fq); fq *= 2.1; amp *= .5; }
  }
  return r * uRelief;
}
vec3 jit(vec3 p, float o){ return vec3(vnoise(p) - .5, vnoise(p + o) - .5, vnoise(p + o * 1.7) - .5); }
vec3 rnd(vec3 c){ return vec3(hash(c + 3.1), hash(c + 7.7), hash(c + 5.3)); }
vec3 tang(vec3 v, vec3 n){ return v - dot(v, n) * n; }       // bumps tilt the normal, never lengthen it
#else
vec3 jit(vec2 p, float o){ return vec3(vnoise(p) - .5, vnoise(p + o) - .5, 0.); }
vec2 rnd(vec2 c){ return vec2(hash(c + 3.1), hash(c + 7.7)); }
vec3 tang(vec3 v, vec3 n){ return v; }
#endif
float lump(TX p){ return vnoise(p) + .5 * vnoise(p * 2.1 + 3.3); }
#ifdef MESH
vec3 lumpGrad(vec3 p, float l0){ return vec3(l0 - lump(p + vec3(.3, 0., 0.)), l0 - lump(p + vec3(0., .3, 0.)), l0 - lump(p + vec3(0., 0., .3))); }
#else
vec3 lumpGrad(vec2 p, float l0){ return vec3(l0 - lump(p + vec2(.3, 0.)), l0 - lump(p + vec2(0., .3)), 0.); }
#endif

void main(){
  lnA = log(uA);
#ifdef MESH
  vec2 uv = vUv;
#else
  vec2 uv = uView.xy + vUv * uView.zw;
  // off the board (close-up covers the window) nothing is drawn; masked rather than returned, so fwidth stays defined
  float inDoc = step(0., uv.x) * step(uv.x, 1.) * step(0., uv.y) * step(uv.y, 1.);
#endif
  vec2 c = F(uv);
  float R = c.x;
  float fw = max(fwidth(R), 1e-4);
  vec2 doc = vec2(uv.x, 1. - uv.y) * uDoc;
#ifdef MESH
  vec3 tx = vP;
#else
  vec2 tx = doc;
#endif

  // optional soft cast shadow (off by default: the references carry depth in the material alone)
  float shA = 0.;
#ifndef MESH
  if (uShadow > 0.) {
    vec2 tl = normalize(uL.xy + vec2(1e-5));
    vec2 so = vec2(tl.x, -tl.y) * uShadowDist / uDoc;
    vec2 sp = vec2(-so.y, so.x) * .5;
    float rs = .25 * (F(uv + so + sp).x + F(uv + so - sp).x + F(uv + so * 1.5).x + F(uv + so * .6).x);
    shA = clamp(max(smoothstep(.06, 1.3, rs) * .5, smoothstep(.3, 1., R) * .28) * uShadow, 0., 1.);
  }
#endif

  // stone relief is needed before coverage: craters and scoops chip the silhouette
#ifdef MESH
  vec4 rel = vec4(0.); float cav = 0., bite = 0.;
  if (uBrush == 2 && R > .6 && uPass == 1) rel = stoneRelief(tx, cav, bite);   // the depth pass skips it
  bite = 0.;       // chipping the outline is a 2D trick; on the tall 3D walls it punches holes
#else
  vec3 rel = vec3(0.); float cav = 0., bite = 0.;
  if (uBrush == 2 && R > .6) rel = stoneRelief(doc, cav, bite);
#endif
  float a = clamp((R - bite - 1.) / (fw * 1.5) + .5, 0., 1.);
#ifndef MESH
  a *= inDoc; shA *= inDoc;
#endif
  ${mesh ? 'if (uPass == 0) { if (a < .5) discard; o = vec4(0.); return; }' : ''}
  if (a <= 0. && shA < .002) { o = vec4(0.); return; }

  vec3 col = vec3(0.);
  if (a > 0.) {
    vec2 t = 1.1 / uRes;
    float tDoc = 2. * 1.1 * uDoc.x / uRes.x;
    float hl = H(uv - vec2(t.x, 0.)), hR = H(uv + vec2(t.x, 0.));
    float hu = H(uv + vec2(0., t.y)), hd = H(uv - vec2(0., t.y));
    vec3 N0 = normalize(vec3(-(hR - hl) / tDoc * uVol, -(hd - hu) / tDoc * uVol, 1.));
#ifdef MESH
    // the surface at its real height (× Depth), on this side of the stroke, turned into the room. Shaded with
    // the round bevel rather than the mesh's own profile: its normal lies flat at the rim, so the two halves
    // of a stroke shade as one rounded body instead of meeting at a crease
    float k3 = uVol * uDepth;
    float cl = Hc(uv - vec2(t.x, 0.)), cr = Hc(uv + vec2(t.x, 0.)), cu = Hc(uv + vec2(0., t.y)), cd = Hc(uv - vec2(0., t.y));
    N0 = OW(normalize(vec3(-(cr - cl) / tDoc * k3, -(cd - cu) / tDoc * k3, uSide)));
#endif
#ifndef MESH
    // laid over other layers, it drapes (see FS_SCENE): tilt it by the slope of what it stands on, so it turns
    // from the light as it climbs down rather than staying flat and meeting a hard shadow there
    if (uLit > 0 && dot(uBaseCh, uBaseCh) > 0.) {
      vec2 bt = uLBTexel;
      float bl = dot(texture(uBase, uv - vec2(bt.x, 0.)), uBaseCh), br = dot(texture(uBase, uv + vec2(bt.x, 0.)), uBaseCh);
      float bd = dot(texture(uBase, uv - vec2(0., bt.y)), uBaseCh), bu = dot(texture(uBase, uv + vec2(0., bt.y)), uBaseCh);
      N0 = normalize(vec3(N0.xy / N0.z - vec2((br - bl) / (2. * bt.x * uDoc.x), -(bu - bd) / (2. * bt.y * uDoc.y)), 1.));
    }
#endif
    vec3 N = N0;
    vec3 L = uL, V = ${mesh ? 'OW(normalize(uCam - vP))' : 'vec3(0., 0., 1.)'};
    vec2 Lxy = normalize(L.xy + vec2(1e-5));
    float rad = c.y;
    float e0 = innerE(max(R, 1.0001));
    float wob = fbm(tx / 120. + uSeed) - .5;
    // fine photographic grain: two octaves of ~1 doc-px noise
    float gn = (hash(floor(tx * 1.4) + uSeed) - .5) * .9 + (vnoise(tx / 1.6 + uSeed * 3.1) - .5) * .7;
    // scene light: how much of the key gets through, how open the sky is, and the colour of what's around
    float sVis = 1., sAo = 1.;
    vec3 envG = uBgC;
    if (uLit > 0) {
      // this point's height in the scene: its own (clay stands on its hidden lower half, see FS_SCENE, so its
      // visible rim is the equator, a radius up) on top of the layers below it
      float zs = (H(uv) + (uBrush == 3 ? rad : 0.)) * uVol + dot(texture(uBase, uv), uBaseCh);
      if (uLit == 1) sVis = keyVis(uLB, uv, zs);
      sAo = mix(1., sceneAO(uv, zs), uShade);
      envG = textureLod(uSA, uv, uEnvLod).rgb;
    }

    if (uBrush == 0) {
      // ── glazed ceramic / slip ──
      TX op = tx / 2.8 + uSeed;
      N = normalize(N + tang(OW(jit(op, 9.1)), N) * uGrain * .08);
      TX lp = tx / 30. + uSeed * 5.;                                    // gentle hand-made lumps
      N = normalize(N + tang(OW(lumpGrad(lp, lump(lp))), N) * (.1 + .2 * uGrain) * smoothstep(0., .35, e0));
      float mott = fbm(tx / 34. + uSeed * 2.) - .5;
      vec3 base = uC0;
      float thin = 1. - smoothstep(.1, .8, e0);
      vec3 brk = mix(base, vec3(1., .84, .62), .4);               // glaze breaks warm & pale on thin edges
      vec3 alb = mix(base, brk, thin * uBreak * .8);
      alb *= 1. + mott * .035 * (.35 + uGrain) + gn * .02 * uGrain;
      TX cell = floor(tx / 4.2), fc = fract(tx / 4.2);              // iron speckle
      float on = step(1. - uSpeckle * SPECK, hash(cell + uSeed));
      TX cp = rnd(cell) * .6 + .2;
      float rr = .1 + .26 * hash(cell + 11.3);
      alb = mix(alb, vec3(.035, .025, .02), on * (1. - smoothstep(rr * .55, rr, length(fc - cp))) * .9);
      float ndl = dot(N, L);
      float diff = smoothstep(-.6, .95, ndl);
      float amb = .35 + .65 * N.z;
      col = alb * (.34 * amb + mix(.72, .6, uGloss) * diff * diff);
      vec3 Rr = reflect(-V, N);
      float rl = dot(Rr, L);
      float sheen = smoothstep(.45, .98, rl); sheen *= sheen;      // broad satin band along the lit crest
      col += sheen * mix(.05, .24, uGloss) * uShine;
      float glint = smoothstep(mix(.94, .978, uGloss), .996, rl + gn * .02);
      col += glint * smoothstep(.55, .95, uGloss) * uShine * .5;        // crisp glint only on real glazes
      float away = clamp(-dot(normalize(N.xy + 1e-5), Lxy), 0., 1.);
      col += alb * .07 * smoothstep(.55, 1., 1. - N.z) * away;      // bounce light on the shadow rim
    } else if (uBrush == 2) {
      // ── stone: comet pit / obsidian ──
#ifdef MESH
      N = normalize(N0 - tang(OW(rel.yzw), N0));
#else
      N = normalize(vec3(N0.xy / N0.z - rel.yz, 1.));
#endif
      float mott = fbm(tx / (16. * uDScale) + uSeed) - .5;
      float fleck = hash(floor(tx / 1.6) + uSeed) - .5;            // granular light and dark flecks
      vec3 alb = uC0 * (1. + mott * .5 * uGrain + gn * .1 * uGrain + fleck * .4 * uGrain);
      alb *= 1. - cav * .65;                                         // crater floors sit in shadow and dust
      float ndl = dot(N, L);
      float diff = clamp((ndl + .08) / 1.08, 0., 1.);
      float amb = .12 + .22 * N.z;
      col = alb * (amb * (1. - cav * .5) + 1.3 * diff);
      vec3 Rr = reflect(-V, N);
      float fres = .04 + .96 * pow(1. - clamp(N.z, 0., 1.), 5.);
      float spec = stoneEnv(Rr, L, uGloss) * fres * mix(.2, 14., uGloss * uGloss);
      col += spec * uShine * (1. - cav * .7);
    } else if (uBrush == 3) {
      // ── modelling clay ── lit like a photograph: a soft key, the sky, and bounce from what's around.
      // Divided by what flat open ground receives, so a lit top shows the chosen colour as it is.
      // hand-worked: broad lumps, smaller dents where a thumb pressed, the fine tooth of the clay itself
      float inner = smoothstep(0., .3, e0);
      TX lp = tx / 24. + uSeed * 5.;
      N = normalize(N + tang(OW(lumpGrad(lp, lump(lp))), N) * (.05 + .28 * uGrain) * inner);
      TX dp = tx / 11. + uSeed * 2.3;
      N = normalize(N + tang(OW(lumpGrad(dp, lump(dp))), N) * .1 * uGrain * inner);
      TX op = tx / 1.7 + uSeed;
      N = normalize(N + tang(OW(jit(op, 13.3)), N) * .045 * uGrain);
      float mott = fbm(tx / 46. + uSeed * 2.) - .5;
      vec3 alb = uC0 * (1. + mott * .07 + gn * .025 * uGrain);
      float ndl = dot(N, L), lam = max(ndl, 0.);
      // soft clay lets light in: the terminator wraps further round, in the colour at full strength
      float wk = .2 + .5 * uGlow, wrap = clamp((ndl + wk) / (1. + wk), 0., 1.);
      vec3 deep = alb / max(max(alb.r, max(alb.g, alb.b)), .03);
      vec3 key = uKeyC * lam * sVis;
      vec3 sss = uKeyC * (wrap - lam) * mix(.4, 1., sVis) * uGlow * .55 * deep;
      // the sky from above; from below, the ground the wall faces, as lit as that ground is: in front of the
      // lit side it's bright paper, in front of the shadow side it's the shadow, so that side goes deep
      float up = .5 + .5 * clamp(N.z, -1., 1.);
      vec3 gRad = envG * uOpenC * .5;
      if (uLit > 0) {
#ifdef MESH
        vec2 gq = uv;
#else
        vec2 gq = uv + vec2(N.x, -N.y) * rad * .9 / uDoc;
#endif
        vec3 ga = textureLod(uSA, gq, max(uEnvLod - 1., 0.)).rgb;
        gRad = ga * (uKeyC * uL.z * (uLit == 1 ? texture(uLB, gq).g : 1.) + uSkyC * .75) * .5;   // cheap: paper-level light, typical occlusion
      }
      // the clay meets the board just below what we see; its lowest band sits in that crease
      float crease = mix(.6, 1., smoothstep(0., .4, e0));
      vec3 amb = uSkyC * up * sAo + gRad * (1. - up) * crease;
      col = alb * (key + amb * crease) + alb * sss;
      // satin: the soft key mirrored as a broad sheen along the lit crest, tightening as Sheen goes up
      vec3 Hh = normalize(L + V);
      float nh = max(dot(N, Hh), 0.);
      float lobe = pow(nh, mix(6., 48., uGloss * uGloss)) * mix(.16, .42, uGloss);
      col += uKeyC * lobe * smoothstep(0., .2, lam) * sVis * uShine;
      // grazing walls mirror a little of what's around them
      vec3 Rr = reflect(-V, N);
      float fr = .04 + .96 * pow(1. - clamp(dot(N, V), 0., 1.), 5.);
      col += fr * mix(gRad, uSkyC * sAo, smoothstep(-.2, .5, Rr.z)) * .45 * (.3 + uGloss);
      col /= uOpenC;
    } else {
      // ── liquid metal ──
      TX np = tx / 6. + uSeed;
      N = normalize(N + tang(OW(jit(np, 31.7)), N) * uRough * .9);
      vec3 Rr = reflect(-V, N);
      float tilt = 1. - N.z;                                         // 0 = flat top, 1 = vertical wall
      float side = dot(normalize(N.xy + 1e-5), Lxy) * smoothstep(.0, .2, tilt);
      // the flat top mirrors the room overhead (Sky), the bevel mirrors the bright floor around it (Rim);
      // the boundary between them is dithered by the grain, which is what reads as real metal
      float hc = H(uv), px = uDoc.x / uRes.x, hs = tDoc * .5;
      float turn = .9 * max(abs(hl + hR - 2. * hc), abs(hu + hd - 2. * hc)) / (hs * hs) * uVol * px;
      float w = max(.015, min(turn, .06));                            // boundary stays crisp; Banding only shapes the palette
      float t1 = .11 + wob * .05;
      float tt = smoothstep(t1 - w - .012, t1 + w + .012, tilt);
      float dn = hash(floor(tx * 1.7) + uSeed * 1.3) - .5;              // crisp per-pixel dither, like film grain
      tt = clamp(tt + dn * 1.1 * uGrain * (1. - abs(2. * tt - 1.)), 0., 1.);   // grain only dithers the boundary
      float top = uSky + wob * .2 + gn * .14 * uGrain + .1 * clamp(side * 4., -1., 1.) * smoothstep(0., t1, tilt);
      // bevel profile sampled from the reference: away from the light it brightens toward the outer edge,
      // on the lit side it peaks right after the boundary (where the glint sits) and falls off outward
      float sAway = mix(.76, 1.07, smoothstep(t1, .75, tilt));
      float sLit = mix(1., .88, smoothstep(t1, .9, tilt));
      float rimv = uRim * mix(sAway, sLit, smoothstep(-.15, .55, side)) - .12 * smoothstep(.9, 1., tilt) + gn * .02 * uGrain;
      float e = mix(top, rimv, tt);
      float rl = dot(Rr, L);
      float az = dot(normalize(Rr.xy + 1e-5), Lxy);
      float lineSpec = (1. - smoothstep(0., mix(.03, .09, uRough), abs(Rr.z - L.z))) * smoothstep(.15, .85, az);   // long softbox
      float spec = max(lineSpec * .85, smoothstep(mix(.955, .9, uRough), .997, rl));
      e += spec * uShine * .9;
      e = clamp((e - .5) * uContrast + .5, 0., 1.);
      float k = max(mix(.5, .03, uBreak), min(turn * 1.2, .12));
      float tp = e < .5 ? e * 2. : e * 2. - 1.;
      tp = mix(tp, smoothstep(.5 - k, .5 + k, tp), uBreak);          // Banding: linear ramp → posterised steps
      vec3 cm = e < .5 ? mix(uC0, uC1, tp) : mix(uC1, uC2, tp);
      vec3 iri = .5 + .5 * cos(6.2831 * (vec3(0., .33, .67) + Rr.z * 1.1 + side * .25 + wob * 1.5));
      cm = mix(cm, cm * (.3 + 1.15 * iri), uIri);
      col = cm;
    }
    // the other materials keep their own lighting; the scene only shades them where it's blocked
    if (uLit > 0 && uBrush != 3) col *= mix(1. - .45 * uShade, 1., sVis) * mix(1., sAo, .7);
  }
  col = col / (1. + max(col - 1., 0.));
  vec3 srgb = pow(max(col, 0.), vec3(1. / 2.2));
  o = vec4(srgb * a, a + (1. - a) * shA);
}`;

/* 3D view. Each layer is a grid lifted by its own height (× Depth) and stood on the layers below it
   (uStack holds their summed heights). Positions are doc px with z towards the viewer. */
const VS_MESH = `#version 300 es
precision highp float;
layout(location=0) in vec2 aUv;
${GL_H}
uniform sampler2D uStack;
uniform int uHasStack;
uniform mat4 uMVP;
uniform float uVol, uDepth, uLift, uSide;
out vec2 vUv; out vec3 vP;
void main(){
  lnA = log(uA);
  vUv = aUv;
  float z = Hg(aUv) * uVol * uDepth + uLift;
  if (uHasStack == 1) z += texture(uStack, aUv).r;
  z *= uSide;
  vP = vec3(aUv.x * uDoc.x, (1. - aUv.y) * uDoc.y, z);
  gl_Position = uMVP * vec4(vP, 1.);
}`;
// one layer's height × uK: raw into a float target (the stack), or packed into 16 bits of RGBA8 for reading back
const FS_HGT = `#version 300 es
precision highp float; in vec2 vUv;
${GL_H}
uniform float uK, uEnc; out vec4 o;
void main(){
  lnA = log(uA);
  float hh = max(Hg(vUv), 0.) * uK;
  if (uEnc > 0.) { float x = floor(clamp(hh / uEnc, 0., 1.) * 65535. + .5), hi = floor(x / 256.); o = vec4(hi / 255., (x - hi * 256.) / 255., 0., 1.); }
  else o = vec4(hh, 0., 0., 0.);
}`;
// the artboard as a slab: the top face is the background exactly as in 2D, the sides shade with the light
const VS_SLAB = `#version 300 es
layout(location=0) in vec3 aP; layout(location=1) in vec3 aN; layout(location=2) in vec2 aUv;
uniform mat4 uMVP; out vec3 vN; out vec2 vUv;
void main(){ vN = aN; vUv = aUv; gl_Position = uMVP * vec4(aP, 1.); }`;
const FS_SLAB = `#version 300 es
precision highp float; in vec3 vN; in vec2 vUv;
uniform vec3 uBg, uL; uniform int uImg; uniform sampler2D uTex; out vec4 o;
void main(){
  vec3 c = uImg == 1 ? texture(uTex, vUv).rgb : uBg;
  float s = vN.z > .5 ? 1. : .62 + .3 * max(dot(vN, uL), 0.);
  o = vec4(c * s, 1.);
}`;

return { VS_FULL, VS_STAMP, FS_STAMP, FS_COPY, FS_ERASE, FS_BG, FS_SCENE, FS_LIGHT, GL_H, fsComp, VS_MESH, FS_HGT, VS_SLAB, FS_SLAB };
})();
