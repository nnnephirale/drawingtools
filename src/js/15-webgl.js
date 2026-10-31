/* ════════════════════════════════════════════════════════════════════
   WebGL
   ════════════════════════════════════════════════════════════════════ */
const canvas = $('#c'), board = $('#board'), stage = $('#stage');
const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
  preserveDrawingBuffer: false, desynchronized: true, powerPreference: 'high-performance' });
if (!gl) {
  board.append(h('div', { class: 'fatal' }, 'This browser has no WebGL2, which the brushes need. Try a current Safari, Chrome or Firefox.'));
  board.style.width = '520px'; board.style.height = '320px';
  return;
}
gl.getExtension('EXT_color_buffer_float');
gl.getExtension('EXT_color_buffer_half_float');
gl.getExtension('EXT_float_blend');

// GLSL lives in js/shaders.js
const { VS_FULL, VS_STAMP, FS_STAMP, FS_COPY, FS_ERASE, FS_BG, FS_SCENE, FS_LIGHT, GL_H, fsComp, VS_MESH, FS_HGT, VS_SLAB, FS_SLAB } = window.SM_SHADERS;

function compile(type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
function program(vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace('[0]', '')] = gl.getUniformLocation(p, info.name); }
  return { p, u };
}
const PR = {
  stamp: program(VS_STAMP, FS_STAMP),
  copy: program(VS_FULL, FS_COPY),
  erase: program(VS_FULL, FS_ERASE),
  bg: program(VS_FULL, FS_BG),
  comp: program(VS_FULL, fsComp(false)),
  mesh: program(VS_MESH, fsComp(true)),
  hgt: program(VS_FULL, FS_HGT),
  slab: program(VS_SLAB, FS_SLAB),
  scene: program(VS_FULL, FS_SCENE),
  light: program(VS_FULL, FS_LIGHT),
};

// stamp geometry: one quad, instanced per stamp
const stampVAO = gl.createVertexArray();
gl.bindVertexArray(stampVAO);
const cornerBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
const instBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 20, 0); gl.vertexAttribDivisor(1, 1);
gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 20, 16); gl.vertexAttribDivisor(2, 1);
gl.bindVertexArray(null);
const emptyVAO = gl.createVertexArray();

// field format: half-float where possible; 8-bit with a scaled range as a last resort
const FMT8 = { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE };
let FIELD = { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, scale: 1 };
function makeTarget(w, hgt, fmt) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, fmt.internal, w, hgt, 0, fmt.format, fmt.type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fb, w, h: hgt, ok };
}
{
  const t = makeTarget(4, 4, FIELD);
  if (!t.ok) FIELD = { ...FMT8, scale: 1 / 12 };
  freeTarget(t);
}
function freeTarget(t) { if (!t) return; gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); }
function swapTarget(a, b) { [a.tex, b.tex] = [b.tex, a.tex]; [a.fb, b.fb] = [b.fb, a.fb]; fieldGen++; }
let fieldGen = 0;      // counts writes to any height field, so the scene light knows when to look again
function clearTarget(t) { gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb); gl.viewport(0, 0, t.w, t.h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
function bindTex(unit, tex) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); }
function fullscreen(prog, target, setup) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
  gl.viewport(0, 0, target ? target.w : canvas.width, target ? target.h : canvas.height);
  gl.useProgram(prog.p); setup(prog.u);
  gl.bindVertexArray(emptyVAO); gl.drawArrays(gl.TRIANGLES, 0, 3);
}

