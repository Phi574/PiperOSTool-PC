const crypto = require('node:crypto');
const net = require('node:net');
const os = require('node:os');

function localIpv4() {
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family === 'IPv4' && !address.internal) return address.address;
    }
  }
  return null;
}

class PcPairingService {
  constructor(onPaired) { this.onPaired = onPaired; this.server = null; this.token = null; this.timeout = null; }

  async start() {
    this.stop();
    const host = localIpv4();
    if (!host) throw new Error('PC chưa có địa chỉ mạng nội bộ để tạo mã QR.');
    this.token = crypto.randomBytes(24).toString('base64url');
    this.server = net.createServer((socket) => this.handle(socket));
    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(39778, '0.0.0.0', () => { this.server.off('error', reject); resolve(); });
    });
    const port = this.server.address().port;
    this.timeout = setTimeout(() => this.stop(), 5 * 60_000);
    return { uri: `piperos://remote-pc?host=${encodeURIComponent(host)}&port=${port}&token=${encodeURIComponent(this.token)}`, expiresAt: Date.now() + 5 * 60_000 };
  }

  handle(socket) {
    socket.setEncoding('utf8');
    let raw = '';
    socket.on('data', (chunk) => {
      raw += chunk;
      if (!raw.includes('\n')) return;
      const [magic, token, port, credential, method] = raw.trim().split('|');
      if (magic !== 'PIPER_REMOTE_PC_PAIR' || token !== this.token || method !== 'QR' || !Number(port)) return socket.destroy();
      const host = socket.remoteAddress?.replace(/^::ffff:/, '');
      if (!host) return socket.destroy();
      socket.end('OK\n');
      this.stop();
      Promise.resolve(this.onPaired({ host, port: Number(port), credential, method: 'QR' })).catch(() => {});
    });
    socket.on('error', () => {});
  }

  stop() { if (this.timeout) clearTimeout(this.timeout); this.timeout = null; this.token = null; this.server?.close(); this.server = null; }
}

module.exports = { PcPairingService };
