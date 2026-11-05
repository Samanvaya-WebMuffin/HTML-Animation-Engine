/** Uniform values: a number (float) or a 2–4 component vector. */
export type UniformValue =
  | number
  | readonly [number, number]
  | readonly [number, number, number]
  | readonly [number, number, number, number];
export type Uniforms = Readonly<Record<string, UniformValue>>;

export interface ShaderLayerOptions {
  readonly width: number;
  readonly height: number;
  /** Backing-store scale. Default 1. */
  readonly pixelRatio?: number;
  /**
   * GLSL ES 3.00 fragment shader (`#version 300 es` is added for you). It
   * receives `uniform vec2 uResolution` (px, at pixelRatio) and writes
   * `out vec4 fragColor`. Everything else must come from uniforms, so the
   * output is a pure function of them.
   */
  readonly fragment: string;
}

export interface ShaderLayer {
  readonly element: HTMLCanvasElement;
  /** Draws one frame with these uniform values. */
  render(uniforms: Uniforms): void;
  destroy(): void;
}

const VERTEX = `#version 300 es
in vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
`;

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Shader layer: could not create a shader.');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? '';
    gl.deleteShader(shader);
    throw new Error(`Shader layer: compile failed:\n${log}`);
  }
  return shader;
}

/**
 * A full-frame WebGL2 fragment shader. The canvas keeps its drawing buffer
 * (`preserveDrawingBuffer`) so screenshots and pixel reads see the frame.
 */
export function createShaderLayer(host: HTMLElement, options: ShaderLayerOptions): ShaderLayer {
  const pixelRatio = options.pixelRatio ?? 1;
  const canvas = host.ownerDocument.createElement('canvas');
  canvas.width = Math.round(options.width * pixelRatio);
  canvas.height = Math.round(options.height * pixelRatio);
  Object.assign(canvas.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    width: `${options.width}px`,
    height: `${options.height}px`,
  });
  host.append(canvas);
  const context = canvas.getContext('webgl2', {
    preserveDrawingBuffer: true,
    antialias: false,
    premultipliedAlpha: true,
    alpha: true,
  });
  if (!context) throw new Error('Shader layer: WebGL2 is unavailable.');
  const gl = context;

  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(
    program,
    compile(
      gl,
      gl.FRAGMENT_SHADER,
      `#version 300 es\nprecision highp float;\nprecision highp int;\nuniform vec2 uResolution;\nout vec4 fragColor;\n${options.fragment}`,
    ),
  );
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Shader layer: link failed:\n${gl.getProgramInfoLog(program) ?? ''}`);
  }
  gl.useProgram(program);

  // One triangle that covers the whole viewport.
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'aPosition');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const locations = new Map<string, WebGLUniformLocation | null>();
  const location = (name: string) => {
    if (!locations.has(name)) locations.set(name, gl.getUniformLocation(program, name));
    return locations.get(name) ?? null;
  };
  const set = (name: string, value: UniformValue) => {
    const at = location(name);
    if (!at) return; // unused uniforms are optimised away by the compiler
    if (typeof value === 'number') gl.uniform1f(at, value);
    else if (value.length === 2) gl.uniform2f(at, value[0], value[1]);
    else if (value.length === 3) gl.uniform3f(at, value[0], value[1], value[2]);
    else gl.uniform4f(at, value[0], value[1], value[2], value[3]);
  };

  return {
    element: canvas,
    render(uniforms) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      set('uResolution', [canvas.width, canvas.height]);
      for (const [name, value] of Object.entries(uniforms)) set(name, value);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    destroy() {
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      canvas.remove();
    },
  };
}
