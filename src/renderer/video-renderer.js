class PiperHardwareVideoRenderer {
  constructor(canvas, onError, onStats, onResize) {
    this.canvas = canvas;
    this.onError = onError;
    this.onStats = onStats;
    this.onResize = onResize;
    this.decoder = null;
    this.generation = 0;
    this.stream = 0;
    this.codecData = new Uint8Array();
    this.frameTimings = new Map();
    this.resetStats();
    this.gl = canvas.getContext('webgl2', { alpha: false, antialias: false, desynchronized: true }) ||
      canvas.getContext('webgl', { alpha: false, antialias: false, desynchronized: true });
    this.context2d = this.gl ? null : canvas.getContext('2d', { alpha: false });
    if (this.gl) this.initGl();
    this.canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.closeDecoder();
      this.onError?.('Windows đã đặt lại bộ giải mã GPU. Hãy kết nối lại thiết bị.');
    });
  }

  initGl() {
    const gl = this.gl;
    const vertex = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertex, 'attribute vec2 p; attribute vec2 t; varying vec2 uv; void main(){uv=t;gl_Position=vec4(p,0.0,1.0);}');
    gl.compileShader(vertex);
    const fragment = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragment, 'precision mediump float; varying vec2 uv; uniform sampler2D frame; void main(){gl_FragColor=texture2D(frame,uv);}');
    gl.compileShader(fragment);
    const program = gl.createProgram();
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program); gl.useProgram(program);
    const vertices = new Float32Array([-1,-1,0,1, 1,-1,1,1, -1,1,0,0, 1,1,1,0]);
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    const p = gl.getAttribLocation(program, 'p'); const t = gl.getAttribLocation(program, 't');
    gl.enableVertexAttribArray(p); gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(t); gl.vertexAttribPointer(t, 2, gl.FLOAT, false, 16, 8);
    this.texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  bytes(value) {
    if (value instanceof Uint8Array) return value;
    if (value?.type === 'Buffer' && Array.isArray(value.data)) return new Uint8Array(value.data);
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    return new Uint8Array(value || []);
  }

  async supportedStream(requested, width, height) {
    if (requested === 0 || !('VideoDecoder' in window)) return 0;
    // Probe both orientations. The phone may rotate before or during sharing.
    const sizes = [[width, height], [height, width]];
    const supports = async (stream) => {
      for (const [codedWidth, codedHeight] of sizes) {
        const result = await VideoDecoder.isConfigSupported(this.decoderConfig(stream, codedWidth, codedHeight));
        if (result.supported) return true;
      }
      return false;
    };
    if (requested === 2 && await supports(2)) return 2;
    if (await supports(1)) return 1;
    return 0;
  }

  decoderConfig(stream, width, height) {
    const config = {
      codec: stream === 2 ? 'hev1.1.6.L120.B0' : 'avc1.640028',
      codedWidth: width, codedHeight: height,
      hardwareAcceleration: 'prefer-hardware', optimizeForLatency: true
    };
    if (stream === 1) config.avc = { format: 'annexb' };
    if (stream === 2) config.hevc = { format: 'annexb' };
    return config;
  }

  async configure({ stream, width, height, codecData }) {
    const generation = ++this.generation;
    this.closeDecoder();
    this.stream = stream;
    this.codecData = this.bytes(codecData);
    this.canvas.width = width; this.canvas.height = height;
    this.onResize?.(width, height);
    this.resetStats();
    if (stream === 0) return;
    if (!('VideoDecoder' in window)) throw new Error('Windows này không hỗ trợ giải mã phần cứng WebCodecs.');
    const config = this.decoderConfig(stream, width, height);
    const support = await VideoDecoder.isConfigSupported(config);
    if (generation !== this.generation) return;
    if (!support.supported) throw new Error(`${stream === 2 ? 'HEVC' : 'H.264'} hardware decode không được Windows hỗ trợ.`);
    this.decoder = new VideoDecoder({
      output: (frame) => {
        if (generation !== this.generation) { frame.close(); return; }
        try {
          this.render(frame);
          this.recordRendered(frame.timestamp);
        } finally { frame.close(); }
      },
      error: (error) => { if (generation === this.generation) this.onError?.(`D3D11 video decode: ${error.message}`); }
    });
    this.decoder.configure(support.config || config);
  }

  decode({ flags, timestampUs, sentAtMs, data }) {
    if (!this.decoder || this.decoder.state !== 'configured') return;
    const key = (flags & 1) !== 0;
    let bytes = this.bytes(data);
    this.recordReceived(bytes.byteLength, timestampUs, sentAtMs);
    if (!key && this.decoder.decodeQueueSize > 3) {
      this.frameTimings.delete(String(timestampUs));
      return;
    }
    if (key && this.codecData.length) {
      const joined = new Uint8Array(this.codecData.length + bytes.length);
      joined.set(this.codecData); joined.set(bytes, this.codecData.length); bytes = joined;
    }
    try {
      this.decoder.decode(new EncodedVideoChunk({ type: key ? 'key' : 'delta', timestamp: Number(timestampUs), data: bytes }));
    } catch (error) { this.onError?.(`Video decode: ${error.message}`); }
  }

  async renderJpeg(bytes, sentAtMs) {
    const generation = this.generation;
    const encoded = this.bytes(bytes);
    const receivedAt = performance.now();
    const image = await createImageBitmap(new Blob([encoded], { type: 'image/jpeg' }));
    try {
      if (generation !== this.generation) return;
      this.canvas.width = image.width; this.canvas.height = image.height; this.render(image);
      this.onResize?.(image.width, image.height);
      this.statsBytes += encoded.byteLength;
      this.statsFrames += 1;
      const networkLatency = Date.now() - Number(sentAtMs);
      this.statsLatencyTotal += Number.isFinite(networkLatency) && networkLatency >= 0 && networkLatency < 10_000
        ? networkLatency
        : performance.now() - receivedAt;
      this.statsLatencyCount += 1;
      this.publishStats();
    } finally { image.close(); }
  }

  resetStats() {
    this.statsStartedAt = performance.now();
    this.statsBytes = 0;
    this.statsFrames = 0;
    this.statsLatencyTotal = 0;
    this.statsLatencyCount = 0;
    this.frameTimings?.clear();
  }

  recordReceived(byteLength, timestampUs, sentAtMs) {
    this.statsBytes += byteLength;
    this.frameTimings.set(String(timestampUs), {
      receivedAt: performance.now(),
      sentAtMs: Number(sentAtMs)
    });
    while (this.frameTimings.size > 32) this.frameTimings.delete(this.frameTimings.keys().next().value);
  }

  recordRendered(timestampUs) {
    this.statsFrames += 1;
    const timing = this.frameTimings.get(String(timestampUs));
    if (timing) {
      const networkLatency = Date.now() - timing.sentAtMs;
      const latency = Number.isFinite(networkLatency) && networkLatency >= 0 && networkLatency < 10_000
        ? networkLatency
        : performance.now() - timing.receivedAt;
      this.statsLatencyTotal += latency;
      this.statsLatencyCount += 1;
      this.frameTimings.delete(String(timestampUs));
    }
    this.publishStats();
  }

  publishStats() {
    const now = performance.now();
    const elapsed = now - this.statsStartedAt;
    if (elapsed < 750) return;
    this.onStats?.({
      width: this.canvas.width,
      height: this.canvas.height,
      stream: this.stream,
      fps: this.statsFrames * 1000 / elapsed,
      mbps: this.statsBytes * 8 / 1_000_000 * 1000 / elapsed,
      latencyMs: this.statsLatencyCount ? this.statsLatencyTotal / this.statsLatencyCount : null
    });
    this.statsStartedAt = now;
    this.statsBytes = 0;
    this.statsFrames = 0;
    this.statsLatencyTotal = 0;
    this.statsLatencyCount = 0;
  }

  render(source) {
    if (this.context2d) {
      this.context2d.drawImage(source, 0, 0, this.canvas.width, this.canvas.height);
      return;
    }
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  closeDecoder() { if (this.decoder) { try { this.decoder.close(); } catch {} this.decoder = null; } }
  close() { this.generation += 1; this.closeDecoder(); this.codecData = new Uint8Array(); this.resetStats(); }
}

window.PiperHardwareVideoRenderer = PiperHardwareVideoRenderer;
