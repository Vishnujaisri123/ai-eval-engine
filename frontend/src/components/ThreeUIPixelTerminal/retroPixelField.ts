/**
 * ThreeUI Community - Retro Pixel Field WebGL Shader
 * Preserved from @designcodeio/threeui (AnimatedTopDock - Retro Variant)
 *
 * MIT License
 * Copyright (c) 2026 Meng To
 *
 * Features:
 * - 2D full-screen quad vertex shader
 * - Fractional Brownian Motion (fbm) noise weather layers
 * - 8x8 recursive Bayer matrix ordered dithering
 * - 8-stop dusk color palette:
 *     0: #0b091c (dark midnight violet)
 *     1: #1b1038 (deep violet)
 *     2: #361753 (dusk purple)
 *     3: #652160 (magenta twilight)
 *     4: #9c2e60 (crimson sunset)
 *     5: #d34c53 (warm coral)
 *     6: #f18049 (amber blaze)
 *     7: #fcc87e (golden horizon)
 * - Dynamic resolution quantization based on pixelSize (default: 4)
 * - CRT scanline raster overlay in CSS
 */

const VERTEX_SHADER_SOURCE = `attribute vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAGMENT_SHADER_SOURCE = `precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uNoise;
uniform float uLevels;

float hash(vec2 p){ p = fract(p * vec2(127.1, 311.7)); p += dot(p, p + 34.23); return fract(p.x * p.y); }

float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p){
  float sum = 0.0, amp = 0.5;
  for (int i = 0; i < 5; i++){ sum += amp * vnoise(p); p = p * 2.03 + 11.7; amp *= 0.5; }
  return sum;
}

/* the classic recursive Bayer construction: each level halves the cell and adds a
   quarter of the coarser threshold, which is cheaper than indexing a matrix and
   avoids the dynamic array access GLSL ES 1.0 will not guarantee */
float bayer2(vec2 a){ a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }
float bayer4(vec2 a){ return bayer2(a * 0.5) * 0.25 + bayer2(a); }
float bayer8(vec2 a){ return bayer4(a * 0.5) * 0.25 + bayer2(a); }

vec3 stop(float index){
  if (index < 0.5) return vec3(0.043, 0.035, 0.109);
  if (index < 1.5) return vec3(0.106, 0.063, 0.220);
  if (index < 2.5) return vec3(0.212, 0.090, 0.325);
  if (index < 3.5) return vec3(0.396, 0.129, 0.376);
  if (index < 4.5) return vec3(0.612, 0.180, 0.376);
  if (index < 5.5) return vec3(0.827, 0.298, 0.325);
  if (index < 6.5) return vec3(0.945, 0.502, 0.286);
  return vec3(0.988, 0.784, 0.494);
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float t = uTime;

  /* two counter-drifting noise sheets read as slow weather rather than as a
     single scrolling texture */
  vec2 cloud = vec2(uv.x * 3.4, uv.y * 2.1);
  float weather = fbm(cloud + vec2(t * 0.055, t * -0.021));
  weather = mix(weather, fbm(cloud * 1.9 + vec2(-t * 0.032, t * 0.044)), 0.42);

  /* the composition is three bands: a deep sky that warms downward, a hot
     horizon at y=0.30, and a dark ground the readout chrome can sit on. The
     falloffs are deliberately wide -- a steep ramp stacks the palette steps into
     thin horizontal bars the ordered dither is too small to break up */
  float sky = smoothstep(0.98, 0.20, uv.y) * 0.36;
  float heat = smoothstep(0.60, 0.16, uv.y) * 0.32;
  float ground = smoothstep(0.26, 0.08, uv.y);
  float sun = smoothstep(0.38, 0.0, length((uv - vec2(0.5, 0.29)) * vec2(0.70, 1.5))) * 0.20;
  /* the three terms sum to just under 1.0 at the horizon: pushing past it clips
     the whole band to the last palette stop and the dither texture disappears */
  float field = 0.11 + sky + heat + sun - ground * 0.80 + (weather - 0.5) * 0.82 * uNoise;

  /* static lives before quantisation so it moves the pixel across a palette step
     instead of tinting it */
  float grain = hash(floor(gl_FragCoord.xy) + floor(t * 12.0)) - 0.5;
  field += grain * 0.055 * uNoise;
  field *= 1.0 - 0.34 * smoothstep(0.45, 1.05, length((uv - vec2(0.5, 0.46)) * vec2(1.06, 1.0)));

  float levels = max(uLevels, 2.0);
  float dither = bayer8(gl_FragCoord.xy) - 0.5;
  float quantised = clamp(field + dither / levels, 0.0, 0.9999);
  /* no scanline here: one drawing-buffer row is pixelSize screen rows tall,
     so darkening alternate rows draws chunky bars rather than a raster. The CRT
     line structure is a screen-resolution CSS overlay instead. */
  gl_FragColor = vec4(stop(floor(quantised * levels) * (7.0 / (levels - 1.0))), 1.0);
}`;

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn("Retro pixel field shader compile warning:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export interface RetroPixelFieldParams {
  pixelSize: number;
  noise: number;
  levels: number;
  speed: number;
}

export interface RetroPixelFieldInstance {
  resize: (width: number, height: number) => void;
  render: (timestamp?: number) => void;
  dispose: () => void;
  setPointer?: (x: number, y: number) => void;
}

const NOOP_FIELD: RetroPixelFieldInstance = {
  resize: () => {},
  render: () => {},
  dispose: () => {},
};

export function createRetroPixelField(
  canvas: HTMLCanvasElement,
  getParams: () => RetroPixelFieldParams
): RetroPixelFieldInstance {
  const gl = canvas.getContext("webgl", {
    antialias: false,
    alpha: false,
    depth: false,
    preserveDrawingBuffer: false,
  });
  if (!gl) return NOOP_FIELD;

  const program = gl.createProgram();
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
  if (!program || !vs || !fs) return NOOP_FIELD;

  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn("Retro pixel field program link warning:", gl.getProgramInfoLog(program));
    return NOOP_FIELD;
  }

  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  // Full-screen triangle covering the -1..1 clip space
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW
  );

  const aPos = gl.getAttribLocation(program, "aPos");
  const uRes = gl.getUniformLocation(program, "uRes");
  const uTime = gl.getUniformLocation(program, "uTime");
  const uNoise = gl.getUniformLocation(program, "uNoise");
  const uLevels = gl.getUniformLocation(program, "uLevels");

  let bufferW = 1;
  let bufferH = 1;
  const startTime = performance.now();
  let elapsed = 0;
  let lastTime = startTime;

  return {
    resize: (viewportWidth: number, viewportHeight: number) => {
      const params = getParams();
      const ps = Math.max(1, params.pixelSize);
      bufferW = Math.max(2, Math.round(viewportWidth / ps));
      bufferH = Math.max(2, Math.round(viewportHeight / ps));

      if (canvas.width !== bufferW || canvas.height !== bufferH) {
        canvas.width = bufferW;
        canvas.height = bufferH;
        gl.viewport(0, 0, bufferW, bufferH);
      }
    },
    render: (timestamp: number = performance.now()) => {
      const params = getParams();
      elapsed += Math.min(96, timestamp - lastTime) * 1e-3 * params.speed;
      lastTime = timestamp;

      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      gl.uniform2f(uRes, bufferW, bufferH);
      gl.uniform1f(uTime, elapsed);
      gl.uniform1f(uNoise, params.noise);
      gl.uniform1f(uLevels, params.levels);

      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose: () => {
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
    },
  };
}
