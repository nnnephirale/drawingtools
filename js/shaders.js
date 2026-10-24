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
  o = vec4(f, f * vR / 64., 0., 0.);
}`;
const FS_COPY = `#version 300 es
precision highp float; in vec2 vUv; uniform sampler2D uSrc; out vec4 o;
void main(){ o = texture(uSrc, vUv); }`;
const FS_ERASE = `#version 300 es
precision highp float; in vec2 vUv; uniform sampler2D uSrc, uE; uniform float uInv; out vec4 o;
void main(){ vec4 f = texture(uSrc, vUv); float e = texture(uE, vUv).r * uInv; o = vec4(f.rg * clamp(1. - e, 0., 1.), 0., 0.); }`;
const FS_BG = `#version 300 es
precision highp float; in vec2 vUv; uniform vec3 uBg; uniform int uImg; uniform sampler2D uTex; out vec4 o;
void main(){ o = uImg == 1 ? vec4(texture(uTex, vec2(vUv.x, 1. - vUv.y)).rgb, 1.) : vec4(uBg, 1.); }`;

/* The material shader. The field texture holds R = summed gaussian density, G = density-weighted radius.
   Surface = where R > 1. From R we recover the distance to the silhouette, then build the height as a
   quarter-circle bevel of radius Edge: thin lines come out round, wide pools and merges go flat on top,
   like a liquid held by surface tension (the reference brushes' puddles).
   The height is shared with the 3D view's mesh and the model export, so it lives in its own chunk. */
const GL_H = `
precision highp sampler2D;
uniform sampler2D uField;
uniform float uInv, uA, uBevel, uBulge;
uniform vec2 uDoc;
vec2 F(vec2 uv){ return texture(uField, uv).rg * uInv; }
float lnA;
// 0 at the silhouette, 1 on the ridge of a lone line (exact for a straight gaussian ridge)
float innerE(float R){ return R >= uA ? 1. : 1. - sqrt(max(log(uA / R) / lnA, 0.)); }
float H(vec2 uv){
  vec2 f = F(uv);
  if (f.x <= 1.) return 0.;
  float rad = f.y / f.x * 64.;
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
  float rad = f.y / f.x * 64.;
  float over = max(f.x / uA - 1., 0.);
  float B = max(min(rad, uBevel), .5);
  float t = clamp((innerE(f.x) * rad + over * rad * .6) / B, -1., 1.);
  float te = edgeT(uv);
  return min(B * (t < 0. ? 2. * t : 1. - (1. - t) * (1. - t)) + uBulge * rad * min(over, 1.2) * .3, uBevel * (1. - (1. - te) * (1. - te)));
}
// the bevel, also closed off at the board's edge (for the 3D view's shading)
float Hc(vec2 uv){ float te = edgeT(uv); return min(H(uv), uBevel * sqrt(1. - (1. - te) * (1. - te))); }`;
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
#endif
${GL_H}
uniform vec2 uRes;
uniform float uVol;
uniform vec3 uL;
uniform int uBrush;
uniform vec3 uC0, uC1, uC2;
uniform float uGloss, uShine, uBreak, uSpeckle, uGrain, uRough, uContrast, uIri, uShadow, uShadowDist, uSeed, uSky, uRim;
uniform float uPits, uFacets, uDScale, uRelief;
out vec4 o;

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
  vec2 uv = vUv;
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
    vec3 N = N0;
    vec3 L = uL, V = ${mesh ? 'OW(normalize(uCam - vP))' : 'vec3(0., 0., 1.)'};
    vec2 Lxy = normalize(L.xy + vec2(1e-5));
    float rad = c.y / max(c.x, 1e-4) * 64.;
    float e0 = innerE(max(R, 1.0001));
    float wob = fbm(tx / 120. + uSeed) - .5;
    // fine photographic grain: two octaves of ~1 doc-px noise
    float gn = (hash(floor(tx * 1.4) + uSeed) - .5) * .9 + (vnoise(tx / 1.6 + uSeed * 3.1) - .5) * .7;

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

return { VS_FULL, VS_STAMP, FS_STAMP, FS_COPY, FS_ERASE, FS_BG, GL_H, fsComp, VS_MESH, FS_HGT, VS_SLAB, FS_SLAB };
})();
