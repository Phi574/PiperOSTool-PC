const $ = (id) => document.getElementById(id);
const status = (value, error = false) => { $('remoteStatus').textContent = value; $('remoteStatus').style.color = error ? 'var(--danger)' : ''; };
const canvas = $('screenCanvas');
const context = canvas.getContext('2d');
let audioContext; let audioRate = 48_000; let audioChannels = 2; let nextAudioAt = 0;

function quality() { return { width: Number($('qualityWidth').value), fps: Number($('qualityFps').value) }; }
function switchMode(mode) {
  document.querySelectorAll('#connectionMode button').forEach((button) => button.classList.toggle('selected', button.dataset.mode === mode));
  ['lan', 'code', 'qr', 'usb'].forEach((item) => $(`${item}Controls`).classList.toggle('hidden', item !== mode));
}
function endpointRow(endpoint) {
  const item = document.createElement('div'); item.className = 'endpoint';
  const info = document.createElement('div'); info.innerHTML = `<strong>${endpoint.name}</strong><small>${endpoint.host}:${endpoint.port} · ${endpoint.method}</small>`;
  const connect = document.createElement('button'); connect.className = 'secondary'; connect.textContent = 'Kết nối';
  connect.onclick = () => connectEndpoint(endpoint); item.append(info, connect); return item;
}
async function connectEndpoint(endpoint) {
  try { status('Đang chờ thiết bị Android xác nhận...'); await window.piperos.connect(endpoint, quality()); } catch (error) { status(error.message, true); }
}
function parseQr() {
  const uri = new URL($('qrUri').value.trim());
  if (uri.protocol !== 'piperos:' || uri.hostname !== 'remote') throw new Error('Mã QR PiperOS không hợp lệ.');
  return { host: uri.searchParams.get('host'), port: Number(uri.searchParams.get('port')), credential: uri.searchParams.get('token'), method: 'QR' };
}
function pcmToFloat(base64) {
  const binary = atob(base64); const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const view = new DataView(bytes.buffer); const frames = bytes.length / (2 * audioChannels);
  const buffer = audioContext.createBuffer(audioChannels, frames, audioRate);
  for (let channel = 0; channel < audioChannels; channel += 1) {
    const output = buffer.getChannelData(channel);
    for (let frame = 0; frame < frames; frame += 1) output[frame] = view.getInt16((frame * audioChannels + channel) * 2, true) / 32768;
  }
  return buffer;
}
function playAudio(base64) {
  audioContext ||= new AudioContext({ latencyHint: 'interactive' });
  const source = audioContext.createBufferSource(); source.buffer = pcmToFloat(base64); source.connect(audioContext.destination);
  nextAudioAt = Math.max(audioContext.currentTime + .02, nextAudioAt); source.start(nextAudioAt); nextAudioAt += source.buffer.duration;
}

document.querySelectorAll('[data-page]').forEach((button) => button.onclick = () => {
  document.querySelectorAll('[data-page]').forEach((item) => item.classList.toggle('active', item === button));
  document.querySelectorAll('.page').forEach((page) => page.classList.toggle('active', page.id === `${button.dataset.page}Page`));
});
document.querySelectorAll('#connectionMode button').forEach((button) => button.onclick = () => switchMode(button.dataset.mode));
$('scanLan').onclick = async () => { status('Đang quét mạng cục bộ...'); const list = await window.piperos.discover(); $('endpointList').replaceChildren(...(list.length ? list.map(endpointRow) : [Object.assign(document.createElement('p'), { className: 'muted', textContent: 'Không tìm thấy thiết bị đang chia sẻ.' })])); status(list.length ? `Tìm thấy ${list.length} thiết bị` : 'Không tìm thấy thiết bị'); };
$('connectCode').onclick = async () => { const code = $('pairCode').value.trim(); if (!/^\d{6}$/.test(code)) return status('Nhập đúng mã 6 chữ số.', true); const [endpoint] = await window.piperos.discover(code); if (!endpoint) return status('Không tìm thấy mã ghép nối.', true); await connectEndpoint({ ...endpoint, method: 'CODE', credential: code }); };
$('connectQr').onclick = async () => { try { await connectEndpoint(parseQr()); } catch (error) { status(error.message, true); } };
$('scanUsb').onclick = async () => { try { const devices = await window.piperos.usbDevices(); $('usbDevices').replaceChildren(...devices.map((device) => Object.assign(document.createElement('option'), { value: device.serial, textContent: `${device.serial} · ${device.details || 'Android'}` }))); if (!devices.length) $('usbDevices').innerHTML = '<option>Không thấy ADB device</option>'; } catch (error) { status(`ADB: ${error.message}`, true); } };
$('connectUsb').onclick = async () => { try { const serial = $('usbDevices').value; const port = Number($('usbPort').value); const credential = $('usbCredential').value.trim(); if (!serial || !port || !credential) throw new Error('Chọn thiết bị, cổng View Remote và khóa phiên.'); status('Đang tạo USB tunnel...'); await window.piperos.usbConnect(serial, port, credential, $('usbMethod').value); } catch (error) { status(error.message, true); } };
$('disconnect').onclick = () => window.piperos.disconnect(); $('sendBack').onclick = () => window.piperos.key(3); $('sendHome').onclick = () => window.piperos.key(4);
$('screenStage').addEventListener('pointerdown', (event) => { const box = canvas.getBoundingClientRect(); window.piperos.touch({ action: 0, x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height }); });
$('screenStage').addEventListener('pointermove', (event) => { if (event.buttons) { const box = canvas.getBoundingClientRect(); window.piperos.touch({ action: 2, x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height }); } });
$('screenStage').addEventListener('pointerup', (event) => { const box = canvas.getBoundingClientRect(); window.piperos.touch({ action: 1, x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height }); });
$('firebaseButton').onclick = async () => { const email = window.prompt('Email Firebase'); if (!email) return; const password = window.prompt('Mật khẩu Firebase'); if (!password) return; try { const user = await window.piperos.firebaseLogin(email, password); $('accountState').textContent = user.email; } catch (error) { $('accountState').textContent = error.message; } };
$('startApple').onclick = async () => { try { const result = await window.piperos.appleStart({ name: $('appleName').value.trim(), resolution: $('appleResolution').value, fps: Number($('appleFps').value) }); $('appleStatus').textContent = result.message; } catch (error) { $('appleStatus').textContent = error.message; } };
window.piperos.on('remote:connected', ({ width, height }) => { canvas.width = width; canvas.height = height; $('viewerEmpty').hidden = true; $('viewerTitle').textContent = `${width} × ${height} · đang kết nối`; status('Đã kết nối'); });
window.piperos.on('remote:frame', ({ width, height, jpeg }) => { const image = new Image(); image.onload = () => { canvas.width = width; canvas.height = height; context.drawImage(image, 0, 0, width, height); }; image.src = `data:image/jpeg;base64,${jpeg}`; });
window.piperos.on('remote:audio-config', ({ sampleRate, channels }) => { audioRate = sampleRate; audioChannels = channels; }); window.piperos.on('remote:audio', playAudio);
window.piperos.on('remote:error', (message) => status(message, true)); window.piperos.on('remote:closed', () => { $('viewerTitle').textContent = 'Phiên đã ngắt'; $('viewerEmpty').hidden = false; status('Đã ngắt kết nối'); });
