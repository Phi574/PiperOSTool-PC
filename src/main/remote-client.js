const dgram = require('node:dgram');
const net = require('node:net');
const { EventEmitter } = require('node:events');

const MAGIC = 'PIPER_REMOTE_4';
const DISCOVERY_PORT = 39776;
const DISCOVER = 'PIPER_REMOTE_DISCOVER';
const CODE_LOOKUP = 'PIPER_REMOTE_CODE|';
const HOST_REPLY = 'PIPER_REMOTE_HOST|';

function ipv4Number(address) {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return null;
  return (((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0);
}

function getBroadcastTargets(interfaces = require('node:os').networkInterfaces()) {
  const targets = new Set(['255.255.255.255']);
  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses || []) {
      if (address.family !== 'IPv4' || address.internal || !address.netmask) continue;
      const ip = ipv4Number(address.address);
      const mask = ipv4Number(address.netmask);
      if (ip == null || mask == null) continue;
      const prefix = address.cidr?.split('/')[1];
      if (prefix != null && Number(prefix) >= 31) continue;
      const broadcast = ((ip & mask) | (~mask >>> 0)) >>> 0;
      targets.add([broadcast >>> 24, (broadcast >>> 16) & 255, (broadcast >>> 8) & 255, broadcast & 255].join('.'));
    }
  }
  return [...targets];
}

function writeUtf(socket, value) {
  const payload = Buffer.from(value, 'utf8');
  const header = Buffer.allocUnsafe(2);
  header.writeUInt16BE(payload.length, 0);
  socket.write(Buffer.concat([header, payload]));
}

const MAX_READER_BUFFER = 10 * 1024 * 1024;

class Reader {
  constructor() { this.buffer = Buffer.alloc(0); }
  push(chunk) {
    if (this.buffer.length + chunk.length > MAX_READER_BUFFER) throw new Error('Dữ liệu luồng vượt giới hạn an toàn.');
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
  }
  take(length) {
    if (this.buffer.length < length) return null;
    const value = this.buffer.subarray(0, length);
    this.buffer = this.buffer.subarray(length);
    return value;
  }
  int() { const raw = this.take(4); return raw && raw.readInt32BE(0); }
  long() { const raw = this.take(8); return raw && raw.readBigInt64BE(0); }
  bool() { const raw = this.take(1); return raw && raw[0] !== 0; }
  utf() {
    if (this.buffer.length < 2) return null;
    const length = this.buffer.readUInt16BE(0);
    if (this.buffer.length < length + 2) return null;
    this.buffer = this.buffer.subarray(2);
    return this.take(length).toString('utf8');
  }
}

async function discoverRemote(code = null, timeoutMs = 2400) {
  return new Promise((resolve) => {
    const found = new Map();
    const socket = dgram.createSocket('udp4');
    const message = Buffer.from(code ? `${CODE_LOOKUP}${code}` : DISCOVER);
    let finished = false;
    let timer = null;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      try { socket.close(); } catch { /* Socket can already be closed after an error. */ }
      resolve([...found.values()]);
    };
    socket.on('message', (raw, remote) => {
      const value = raw.toString('utf8');
      if (!value.startsWith(HOST_REPLY)) return;
      const parts = value.split('|');
      if (parts.length < 5) return;
      const endpoint = {
        name: parts[1], host: remote.address, port: Number(parts[2]),
        sessionId: parts[3], method: parts[4], credential: code || parts[3]
      };
      if (Number.isInteger(endpoint.port)) found.set(`${endpoint.host}:${endpoint.port}`, endpoint);
    });
    socket.bind(() => {
      socket.setBroadcast(true);
      timer = setTimeout(finish, timeoutMs);
      timer.unref?.();
      for (const target of getBroadcastTargets()) {
        socket.send(message, DISCOVERY_PORT, target, () => undefined);
      }
    });
    socket.on('error', finish);
  });
}

class PiperRemoteClient extends EventEmitter {
  constructor() {
    super();
    this.socket = null;
    this.reader = new Reader();
    this.state = 'idle';
    this.phase = 'handshake';
    this.handshakeTimer = null;
  }

  async connect(endpoint, displayName, width, fps, stream = 1) {
    this.close();
    const socket = net.createConnection({ host: endpoint.host, port: endpoint.port });
    this.socket = socket;
    this.state = 'connecting';
    this.phase = 'handshake';
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 10_000);
    socket.on('data', (chunk) => {
      if (socket !== this.socket) return;
      try { this.onData(chunk); } catch (error) { this.emit('error', error.message); this.close(); }
    });
    socket.on('error', (error) => {
      if (socket !== this.socket) return;
      this.emit('error', error.message);
    });
    socket.on('close', () => {
      if (socket !== this.socket) return;
      const wasActive = this.state !== 'idle';
      this.state = 'idle';
      this.phase = 'handshake';
      clearTimeout(this.handshakeTimer);
      this.handshakeTimer = null;
      this.socket = null;
      this.reader = new Reader();
      if (wasActive) this.emit('closed');
    });
    this.handshakeTimer = setTimeout(() => {
      if (socket === this.socket && this.state !== 'connected') {
        this.emit('error', 'Thiết bị không phản hồi bước xác nhận kết nối.');
        this.close();
      }
    }, 15_000);
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Hết thời gian chờ kết nối thiết bị.')), 12_000);
        const onConnect = () => { clearTimeout(timer); socket.removeListener('error', onError); resolve(); };
        const onError = (error) => { clearTimeout(timer); socket.removeListener('connect', onConnect); reject(error); };
        socket.once('connect', onConnect);
        socket.once('error', onError);
      });
      if (socket !== this.socket) throw new Error('Kết nối đã bị thay thế.');
      writeUtf(socket, MAGIC);
      writeUtf(socket, endpoint.method || 'LAN');
      writeUtf(socket, endpoint.credential || endpoint.sessionId || '');
      writeUtf(socket, displayName);
      const settings = Buffer.allocUnsafe(12);
      settings.writeInt32BE(width, 0);
      settings.writeInt32BE(fps, 4);
      settings.writeInt32BE(stream, 8);
      socket.write(settings);
    } catch (error) {
      if (socket === this.socket) this.close();
      throw error;
    }
  }

  onData(chunk) {
        this.reader.push(chunk);
    while (true) {
      if (this.phase === 'handshake') {
        if (this.reader.buffer.length < 1) return;
        const allowed = this.reader.buffer[0] !== 0;
        if (!allowed) {
          if (this.reader.buffer.length < 3) return;
          const reasonLength = this.reader.buffer.readUInt16BE(1);
          if (this.reader.buffer.length < 3 + reasonLength) return;
          this.reader.take(1);
          const reason = this.reader.utf();
          this.emit('error', reason);
          this.close();
          return;
        }
        if (this.reader.buffer.length < 13) return;
        this.reader.take(1);
        const width = this.reader.int(); const height = this.reader.int();
        const stream = this.reader.int();
        this.phase = 'stream'; this.state = 'connected';
        clearTimeout(this.handshakeTimer);
        this.handshakeTimer = null;
        this.emit('connected', { width, height, stream });
        continue;
      }
      if (this.reader.buffer.length < 1) return;
      const kind = this.reader.buffer[0];
      if (kind === 1) {
        if (this.reader.buffer.length < 21) return;
        const width = this.reader.buffer.readInt32BE(1);
        const height = this.reader.buffer.readInt32BE(5);
        const sentAtMs = this.reader.buffer.readBigInt64BE(9);
        const size = this.reader.buffer.readInt32BE(17);
        if (size <= 0 || size > 8_000_000) { this.emit('error', 'Khung hình không hợp lệ.'); this.close(); return; }
        if (this.reader.buffer.length < 21 + size) return;
        this.reader.take(21);
        const jpeg = this.reader.take(size);
        this.emit('frame', { width, height, sentAtMs: sentAtMs.toString(), jpeg });
      } else if (kind === 5) {
        if (this.reader.buffer.length < 9) return;
        this.reader.take(1);
        const sampleRate = this.reader.int(); const channels = this.reader.int();
        this.emit('audio-config', { sampleRate, channels });
      } else if (kind === 6) {
        if (this.reader.buffer.length < 5) return;
        const size = this.reader.buffer.readInt32BE(1);
        if (size <= 0 || size > 262_144) { this.emit('error', 'Gói âm thanh không hợp lệ.'); this.close(); return; }
        if (this.reader.buffer.length < 5 + size) return;
        this.reader.take(5);
        const pcm = this.reader.take(size);
        this.emit('audio', pcm.toString('base64'));
      } else if (kind === 7) {
        if (this.reader.buffer.length < 5) return;
        const size = this.reader.buffer.readInt32BE(1);
        if (size <= 0 || size > 16_384) { this.emit('error', 'Thông tin thiết bị không hợp lệ.'); this.close(); return; }
        if (this.reader.buffer.length < 5 + size) return;
        this.reader.take(5);
        try { this.emit('device-info', JSON.parse(this.reader.take(size).toString('utf8'))); }
        catch { this.emit('error', 'Không thể đọc thông tin thiết bị.'); }
      } else if (kind === 8) {
        if (this.reader.buffer.length < 21) return;
        const stream = this.reader.buffer.readInt32BE(1);
        const width = this.reader.buffer.readInt32BE(5);
        const height = this.reader.buffer.readInt32BE(9);
        const fps = this.reader.buffer.readInt32BE(13);
        const size = this.reader.buffer.readInt32BE(17);
        if (size < 0 || size > 1_048_576) { this.emit('error', 'Cấu hình video không hợp lệ.'); this.close(); return; }
        if (this.reader.buffer.length < 21 + size) return;
        this.reader.take(21);
        this.emit('video-config', { stream, width, height, fps, codecData: this.reader.take(size) });
      } else if (kind === 9) {
        if (this.reader.buffer.length < 25) return;
        const flags = this.reader.buffer.readInt32BE(1);
        const timestampUs = this.reader.buffer.readBigInt64BE(5);
        const sentAtMs = this.reader.buffer.readBigInt64BE(13);
        const size = this.reader.buffer.readInt32BE(21);
        if (size <= 0 || size > 4_194_304) { this.emit('error', 'Gói video không hợp lệ.'); this.close(); return; }
        if (this.reader.buffer.length < 25 + size) return;
        this.reader.take(25);
        this.emit('video-frame', {
          flags,
          timestampUs: timestampUs.toString(),
          sentAtMs: sentAtMs.toString(),
          data: this.reader.take(size)
        });
      } else { this.emit('error', 'Giao thức View Remote không được hỗ trợ.'); this.close(); return; }
    }
  }

  sendTouch(action, x, y) {
    if (!this.socket || this.state !== 'connected') return;
    const packet = Buffer.allocUnsafe(13);
    packet.writeUInt8(2, 0); packet.writeInt32BE(action, 1);
    packet.writeFloatBE(Math.max(0, Math.min(1, x)), 5); packet.writeFloatBE(Math.max(0, Math.min(1, y)), 9);
    this.socket.write(packet);
  }
  sendKey(kind) { if (this.socket?.writable) this.socket.write(Buffer.from([kind])); }
  close() {
    const wasActive = this.state !== 'idle';
    this.state = 'idle';
    this.phase = 'handshake';
    clearTimeout(this.handshakeTimer);
    this.handshakeTimer = null;
    const socket = this.socket;
    this.socket = null;
    this.reader = new Reader();
    socket?.destroy();
    if (wasActive) this.emit('closed');
  }
}

module.exports = { PiperRemoteClient, discoverRemote, getBroadcastTargets };
