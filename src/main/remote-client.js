const dgram = require('node:dgram');
const net = require('node:net');
const { EventEmitter } = require('node:events');

const MAGIC = 'PIPER_REMOTE_2';
const DISCOVERY_PORT = 39776;
const DISCOVER = 'PIPER_REMOTE_DISCOVER';
const CODE_LOOKUP = 'PIPER_REMOTE_CODE|';
const HOST_REPLY = 'PIPER_REMOTE_HOST|';

function writeUtf(socket, value) {
  const payload = Buffer.from(value, 'utf8');
  const header = Buffer.allocUnsafe(2);
  header.writeUInt16BE(payload.length, 0);
  socket.write(Buffer.concat([header, payload]));
}

class Reader {
  constructor() { this.buffer = Buffer.alloc(0); }
  push(chunk) { this.buffer = Buffer.concat([this.buffer, chunk]); }
  take(length) {
    if (this.buffer.length < length) return null;
    const value = this.buffer.subarray(0, length);
    this.buffer = this.buffer.subarray(length);
    return value;
  }
  int() { const raw = this.take(4); return raw && raw.readInt32BE(0); }
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
    const finish = () => { socket.close(); resolve([...found.values()]); };
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
      socket.send(message, DISCOVERY_PORT, '255.255.255.255');
      setTimeout(finish, timeoutMs);
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
  }

  async connect(endpoint, displayName, width, fps) {
    this.close();
    this.state = 'connecting';
    this.phase = 'handshake';
    this.socket = net.createConnection({ host: endpoint.host, port: endpoint.port });
    this.socket.setNoDelay(true);
    this.socket.setKeepAlive(true, 10_000);
    this.socket.on('data', (chunk) => this.onData(chunk));
    this.socket.on('error', (error) => this.emit('error', error.message));
    this.socket.on('close', () => {
      if (this.state !== 'idle') this.emit('closed');
      this.state = 'idle';
    });
    await new Promise((resolve, reject) => {
      this.socket.once('connect', resolve);
      this.socket.once('error', reject);
    });
    writeUtf(this.socket, MAGIC);
    writeUtf(this.socket, endpoint.method || 'LAN');
    writeUtf(this.socket, endpoint.credential || endpoint.sessionId);
    writeUtf(this.socket, displayName);
    const settings = Buffer.allocUnsafe(8);
    settings.writeInt32BE(width, 0);
    settings.writeInt32BE(fps, 4);
    this.socket.write(settings);
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
        if (this.reader.buffer.length < 9) return;
        this.reader.take(1);
        const width = this.reader.int(); const height = this.reader.int();
        this.phase = 'stream'; this.state = 'connected';
        this.emit('connected', { width, height });
        continue;
      }
      if (this.reader.buffer.length < 1) return;
      const kind = this.reader.buffer[0];
      if (kind === 1) {
        if (this.reader.buffer.length < 13) return;
        const width = this.reader.buffer.readInt32BE(1);
        const height = this.reader.buffer.readInt32BE(5);
        const size = this.reader.buffer.readInt32BE(9);
        if (size <= 0 || size > 8_000_000) { this.emit('error', 'Khung hình không hợp lệ.'); this.close(); return; }
        if (this.reader.buffer.length < 13 + size) return;
        this.reader.take(13);
        const jpeg = this.reader.take(size);
        this.emit('frame', { width, height, jpeg: jpeg.toString('base64') });
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
  close() { this.state = 'idle'; this.socket?.destroy(); this.socket = null; this.reader = new Reader(); }
}

module.exports = { PiperRemoteClient, discoverRemote };
