const test = require('node:test');
const assert = require('node:assert/strict');
const { getBroadcastTargets } = require('../src/main/remote-client');
const { pickLocalIpv4 } = require('../src/main/pc-pairing-service');

test('LAN discovery targets each active IPv4 subnet and the limited broadcast', () => {
  const targets = getBroadcastTargets({
    WiFi: [
      { family: 'IPv4', address: '192.168.1.42', netmask: '255.255.255.0', cidr: '192.168.1.42/24', internal: false },
      { family: 'IPv6', address: 'fe80::1', netmask: 'ffff:ffff:ffff:ffff::', internal: false }
    ],
    VPN: [{ family: 'IPv4', address: '10.8.0.3', netmask: '255.255.255.0', cidr: '10.8.0.3/24', internal: false }],
    Loopback: [{ family: 'IPv4', address: '127.0.0.1', netmask: '255.0.0.0', internal: true }],
    PointToPoint: [{ family: 'IPv4', address: '172.16.0.2', netmask: '255.255.255.254', cidr: '172.16.0.2/31', internal: false }]
  });

  assert.deepEqual(targets, ['255.255.255.255', '192.168.1.255', '10.8.0.255']);
});

test('QR host selection prefers Wi-Fi/Ethernet over VPN and ignores APIPA', () => {
  const host = pickLocalIpv4({
    'VPN adapter': [{ family: 'IPv4', address: '10.9.0.8', internal: false }],
    'Wi-Fi': [
      { family: 'IPv4', address: '169.254.2.4', internal: false },
      { family: 'IPv4', address: '192.168.50.20', internal: false }
    ]
  });
  assert.equal(host, '192.168.50.20');
});
