const crypto = require('node:crypto');
const net = require('node:net');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

function pickLocalIpv4(interfaces) {
  const names = Object.keys(interfaces).sort((left, right) => {
    const score = (name) => /wi-?fi|wlan|ethernet/i.test(name) ? 0 : /virtual|vpn|hyper-v|vmware|virtualbox|loopback/i.test(name) ? 2 : 1;
    return score(left) - score(right);
  });
  for (const name of names) {
    for (const address of interfaces[name] || []) {
      if (address.family === 'IPv4' && !address.internal && !address.address.startsWith('169.254.')) return address.address;
    }
  }
  return null;
}

function localIpv4() {
  if (process.platform === 'win32') {
    try {
      const script = "$route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object RouteMetric, InterfaceMetric | Select-Object -First 1; if ($route) { Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $route.InterfaceIndex | Where-Object { $_.IPAddress -notlike '169.254.*' } | Select-Object -First 1 -ExpandProperty IPAddress }";
      const routedAddress = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 2500, stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8').trim();
      if (routedAddress && !routedAddress.startsWith('169.254.')) return routedAddress;
    } catch { /* Fall back to available adapters. */ }
  }
  return pickLocalIpv4(os.networkInterfaces());
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

module.exports = { PcPairingService, pickLocalIpv4 };
