const $ = (id) => document.getElementById(id);
const status = (value, error = false) => { $('remoteStatus').textContent = value; $('remoteStatus').style.color = error ? 'var(--danger)' : ''; };
const canvas = $('screenCanvas');
const videoRenderer = new window.PiperHardwareVideoRenderer(
  canvas,
  (message) => status(message, true),
  ({ width, height, fps, mbps, latencyMs }) => {
    $('streamStats').textContent = `${width} × ${height} thực · ${fps.toFixed(1)} FPS thực · ${mbps.toFixed(2)} Mbps · ${latencyMs == null ? '--' : Math.round(latencyMs)} ms độ trễ`;
  }, fitCanvas
);
let audioContext; let audioRate = 48_000; let audioChannels = 2; let nextAudioAt = 0;
let activeConnection = null;
let fallbackAttempted = false;

function fitCanvas() {
  const stage = $('screenStage');
  if (!stage || !canvas.width || !canvas.height) return;
  const bounds = stage.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  const scale = Math.min(bounds.width / canvas.width, bounds.height / canvas.height);
  canvas.style.width = `${Math.max(1, Math.floor(canvas.width * scale))}px`;
  canvas.style.height = `${Math.max(1, Math.floor(canvas.height * scale))}px`;
}

const stageObserver = new ResizeObserver(fitCanvas);
stageObserver.observe($('screenStage'));

let streamMode = Number(localStorage.getItem('piperos.remote.stream') || 1);
let pendingStreamMode = streamMode;
function quality() { return { width: Number($('qualityWidth').value), fps: Number($('qualityFps').value), stream: streamMode }; }
async function supportedQuality() {
  const selected = quality();
  try {
    selected.stream = await videoRenderer.supportedStream(selected.stream, Math.round(selected.width * 9 / 20), selected.width);
  } catch {
    selected.stream = 0;
  }
  if (selected.stream !== streamMode) {
    status(`${['JPEG tương thích', 'H.264 phần cứng', 'HEVC'][selected.stream]} được dùng vì bộ giải mã không hỗ trợ codec đã chọn.`);
  }
  return selected;
}
async function refreshUsbDevices(showStatus = false) {
  const devices = await window.piperos.usbDevices();
  const select = $('usbDevices');
  select.replaceChildren(...devices.map((device) => Object.assign(document.createElement('option'), {
    value: device.serial,
    disabled: device.state !== 'device',
    textContent: `${device.serial} · ${device.state}${device.details ? ` · ${device.details}` : ''}`
  })));
  if (!devices.length) select.innerHTML = '<option value="">Đang chờ thiết bị cắm cáp...</option>';
  const blocked = devices.find((device) => device.state !== 'device');
  $('usbHint').textContent = blocked
    ? `Đã nhận cáp USB: ${blocked.serial} đang ${blocked.state}. Mở khóa máy và chọn “Cho phép gỡ lỗi USB”.`
    : devices.length
      ? 'Đã nhận thiết bị qua adb devices. Không dùng Gỡ lỗi không dây, QR, IP hay mã kết nối.'
      : 'Chưa thấy thiết bị USB. Hãy bật Gỡ lỗi USB, dùng cáp dữ liệu và xác nhận khóa RSA trên điện thoại.';
  if (showStatus) status(devices.length ? 'Đã nhận ADB qua cáp USB' : 'Đang chờ ADB qua cáp USB', !devices.length);
  return devices;
}
function switchMode(mode) {
  document.querySelectorAll('#connectionMode button').forEach((button) => button.classList.toggle('selected', button.dataset.mode === mode));
  ['lan', 'code', 'qr', 'usb'].forEach((item) => $(`${item}Controls`).classList.toggle('hidden', item !== mode));
  if (mode === 'usb') refreshUsbDevices().catch((error) => status(`ADB: ${error.message}`, true));
}
function endpointRow(endpoint) {
  const item = document.createElement('div'); item.className = 'endpoint';
  const info = document.createElement('div');
  const name = document.createElement('strong'); name.textContent = endpoint.name || 'Thiết bị Android';
  const address = document.createElement('small'); address.textContent = `${endpoint.host}:${endpoint.port} · ${endpoint.method || 'LAN'}`;
  info.append(name, address);
  const connect = document.createElement('button'); connect.className = 'secondary'; connect.textContent = 'Kết nối';
  connect.onclick = () => connectEndpoint(endpoint); item.append(info, connect); return item;
}
async function connectEndpoint(endpoint) {
  try {
    status('Đang kiểm tra bộ giải mã...');
    const selected = await supportedQuality();
    pendingStreamMode = selected.stream;
    activeConnection = { kind: 'network', endpoint, quality: selected };
    fallbackAttempted = false;
    await unlockAudio();
    status('Đang chờ thiết bị Android xác nhận...');
    await window.piperos.connect(endpoint, selected);
  } catch (error) { status(error.message, true); }
}
function parseQr() {
  const uri = new URL($('qrUri').value.trim());
  if (uri.protocol !== 'piperos:' || uri.hostname !== 'remote') throw new Error('Mã QR PiperOS không hợp lệ.');
  const host = uri.searchParams.get('host');
  const port = Number(uri.searchParams.get('port'));
  const credential = uri.searchParams.get('token');
  if (!host || !Number.isInteger(port) || port < 1 || port > 65_535 || !credential) throw new Error('Mã QR thiếu địa chỉ hoặc mã xác thực.');
  return { host, port, credential, method: 'QR' };
}
function pcmToFloat(base64) {
  const binary = atob(base64); const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  if (!bytes.length || bytes.length % (2 * audioChannels) !== 0) throw new Error('Gói âm thanh PCM không đúng định dạng.');
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
  if (audioContext.state === 'suspended') audioContext.resume().catch(() => undefined);
  const source = audioContext.createBufferSource(); source.buffer = pcmToFloat(base64); source.connect(audioContext.destination);
  const now = audioContext.currentTime;
  // Bound queued audio so temporary stalls recover quickly instead of adding delay.
  nextAudioAt = Math.max(now + .025, Math.min(nextAudioAt, now + .12));
  source.start(nextAudioAt); nextAudioAt += source.buffer.duration;
}
async function unlockAudio() {
  try {
    audioContext ||= new AudioContext({ latencyHint: 'interactive' });
    if (audioContext.state === 'suspended') await audioContext.resume();
  } catch { /* Browser may keep audio muted until a user gesture. */ }
}

document.querySelectorAll('[data-page]').forEach((button) => button.onclick = () => {
  document.querySelectorAll('[data-page]').forEach((item) => item.classList.toggle('active', item === button));
  document.querySelectorAll('.page').forEach((page) => page.classList.toggle('active', page.id === `${button.dataset.page}Page`));
});
document.querySelectorAll('#connectionMode button').forEach((button) => button.onclick = () => switchMode(button.dataset.mode));
$('scanLan').onclick = async () => { status('Đang quét mạng cục bộ...'); const list = await window.piperos.discover(); $('endpointList').replaceChildren(...(list.length ? list.map(endpointRow) : [Object.assign(document.createElement('p'), { className: 'muted', textContent: 'Không tìm thấy thiết bị đang chia sẻ.' })])); status(list.length ? `Tìm thấy ${list.length} thiết bị` : 'Không tìm thấy thiết bị'); };
$('connectCode').onclick = async () => { const code = $('pairCode').value.trim(); if (!/^\d{6}$/.test(code)) return status('Nhập đúng mã 6 chữ số.', true); const [endpoint] = await window.piperos.discover(code); if (!endpoint) return status('Không tìm thấy mã ghép nối.', true); await connectEndpoint({ ...endpoint, method: 'CODE', credential: code }); };
$('connectQr').onclick = async () => { try { await connectEndpoint(parseQr()); } catch (error) { status(error.message, true); } };
$('setupUsb').onclick = async () => { try { const result = await window.piperos.usbSetup(); await refreshUsbDevices(); status(result.devices.length ? 'USB / ADB đã sẵn sàng' : 'Đang chờ thiết bị USB', !result.devices.length); } catch (error) { $('usbHint').textContent = error.message; status('Cần cài Platform Tools hoặc driver OEM', true); } };
$('connectUsb').onclick = async () => { try { const devices = await refreshUsbDevices(); const serial = $('usbDevices').value || devices.find((device) => device.state === 'device')?.serial; if (!serial) throw new Error('Chưa có thiết bị ADB qua cáp USB đã được cấp quyền.'); const selected = await supportedQuality(); pendingStreamMode = selected.stream; activeConnection = { kind: 'usb', serial, quality: selected }; fallbackAttempted = false; await unlockAudio(); status('Đang tạo ADB forward qua cáp USB...'); await window.piperos.usbConnect(serial, selected); } catch (error) { status(`${error.message}. Trên Android, mở View Remote > Chia sẻ qua cáp USB (ADB) và xác nhận chụp màn hình.`, true); } };
$('disconnect').onclick = () => { activeConnection = null; fallbackAttempted = false; return window.piperos.disconnect(); }; $('sendBack').onclick = () => window.piperos.key(3); $('sendHome').onclick = () => window.piperos.key(4);
const streamDialog = $('streamDialog');
function syncStreamDialog() { const input = document.querySelector(`input[name="streamMode"][value="${streamMode}"]`); if (input) input.checked = true; }
$('openStreamSettings').onclick = () => { syncStreamDialog(); streamDialog.showModal(); };
$('closeStreamDialog').onclick = () => streamDialog.close();
$('streamForm').addEventListener('submit', (event) => {
  event.preventDefault();
  streamMode = Number(new FormData(event.currentTarget).get('streamMode'));
  localStorage.setItem('piperos.remote.stream', String(streamMode));
  streamDialog.close();
  status(`Đã chọn ${['JPEG tương thích', 'H.264 phần cứng', 'HEVC phần cứng'][streamMode]}. Áp dụng từ lần kết nối kế tiếp.`);
});
const fullscreenButton = $('toggleFullscreen');
const projectionDisplay = $('projectionDisplay');
const projectionDialog = $('projectionDialog');
let projectionMode = false;
let cropSystemBars = localStorage.getItem('piperos.remote.cropSystemBars') === 'true';
function syncCropSetting() {
  $('screenStage').classList.toggle('crop-system-bars', cropSystemBars);
  document.body.classList.toggle('crop-system-bars', cropSystemBars);
  $('cropSystemBars').checked = cropSystemBars;
}
syncCropSetting();
async function loadProjectionDisplays() {
  try {
    const displays = await window.piperos.getDisplays();
    projectionDisplay.replaceChildren(...displays.map((display) => {
      const option = document.createElement('option');
      option.value = String(display.id);
      option.textContent = `${display.name} · ${display.width} × ${display.height}${display.primary ? ' · Chính' : ''}`;
      if (display.primary) option.selected = true;
      return option;
    }));
  } catch { projectionDisplay.replaceChildren(new Option('Màn hình chính', '')); }
}
loadProjectionDisplays();
function syncProjectionButton() {
  fullscreenButton.textContent = projectionMode ? 'Thoát trình chiếu' : '⛶ Trình chiếu';
  fullscreenButton.title = projectionMode ? 'Thoát chế độ trình chiếu (Esc)' : 'Chiếu toàn màn hình lên màn hình đã chọn';
  fullscreenButton.setAttribute('aria-label', fullscreenButton.title);
}
async function exitProjectionMode() {
  await window.piperos.setProjectionMode(false, projectionDisplay.value);
  projectionMode = false;
  document.body.classList.remove('projection-mode');
  syncProjectionButton();
}
fullscreenButton.onclick = async () => {
  if (projectionMode) return exitProjectionMode();
  if (!activeConnection) return status('Kết nối điện thoại trước khi bật chế độ trình chiếu.', true);
  await loadProjectionDisplays();
  $('cropSystemBars').checked = cropSystemBars;
  projectionDialog.showModal();
};
$('closeProjectionDialog').onclick = () => projectionDialog.close();
$('cancelProjection').onclick = () => projectionDialog.close();
$('projectionForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  cropSystemBars = $('cropSystemBars').checked;
  localStorage.setItem('piperos.remote.cropSystemBars', String(cropSystemBars));
  syncCropSetting();
  projectionDialog.close();
  try {
    await window.piperos.setProjectionMode(true, projectionDisplay.value);
    projectionMode = true;
    document.body.classList.add('projection-mode');
    fitCanvas();
    syncProjectionButton();
  } catch (error) { status(`Không thể bật chế độ trình chiếu: ${error.message}`, true); }
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && projectionMode) exitProjectionMode().catch(() => {});
});
window.piperos.on('window:fullscreen', (active) => {
  if (!active && projectionMode) {
    projectionMode = false;
    document.body.classList.remove('projection-mode');
    syncProjectionButton();
  }
});
$('screenStage').addEventListener('pointerdown', (event) => { const box = canvas.getBoundingClientRect(); if (!box.width || !box.height) return; event.currentTarget.setPointerCapture?.(event.pointerId); window.piperos.touch({ action: 0, x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height }); });
$('screenStage').addEventListener('pointermove', (event) => { if (event.buttons) { const box = canvas.getBoundingClientRect(); if (!box.width || !box.height) return; window.piperos.touch({ action: 2, x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height }); } });
$('screenStage').addEventListener('pointerup', (event) => { const box = canvas.getBoundingClientRect(); if (!box.width || !box.height) return; window.piperos.touch({ action: 1, x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height }); });
$('createPcQr').onclick = async () => { try { const selected = await supportedQuality(); pendingStreamMode = selected.stream; activeConnection = null; fallbackAttempted = false; await unlockAudio(); const result = await window.piperos.createPcQr(selected); $('pcQrImage').src = result.image; $('pcQrCard').classList.remove('hidden'); $('pcQrStatus').textContent = `Đang chờ điện thoại quét · ${['JPEG', 'H.264', 'HEVC'][selected.stream]} · ${selected.width}p cạnh dài · ${selected.fps} FPS.`; status('Mã QR PC đã sẵn sàng'); } catch (error) { status(error.message, true); } };
$('startApple').onclick = async () => { try { const result = await window.piperos.appleStart({ name: $('appleName').value.trim(), resolution: $('appleResolution').value, fps: Number($('appleFps').value), fullscreen: $('appleFullscreen').checked }); $('appleStatus').textContent = result.message; $('startApple').disabled = true; $('stopApple').disabled = false; } catch (error) { $('appleStatus').textContent = error.message; } };
$('stopApple').onclick = async () => { const result = await window.piperos.appleStop(); $('appleStatus').textContent = result.message; $('startApple').disabled = false; $('stopApple').disabled = true; };
window.piperos.on('remote:connected', ({ width, height, stream }) => {
  const requested = pendingStreamMode;
  videoRenderer.setFrameRate(activeConnection?.quality?.fps || 60);
  streamMode = stream;
  if (stream === 0) fallbackAttempted = false;
  localStorage.setItem('piperos.remote.stream', String(stream));
  canvas.width = width; canvas.height = height; $('viewerEmpty').hidden = true;
  fitCanvas();
  $('viewerTitle').textContent = `${['JPEG', 'H.264', 'HEVC'][stream] || 'Video'} · đang kết nối`;
  $('streamStats').textContent = `${width} × ${height} thực · đang đo FPS, Mbps và độ trễ…`;
  if (stream === 0) videoRenderer.configure({ stream, width, height, codecData: new Uint8Array() }).catch((error) => status(error.message, true));
  $('deviceSummary').textContent = 'Đang nhận thông tin máy Android…';
  status(requested === stream ? `Đã kết nối bằng ${['JPEG', 'H.264', 'HEVC'][stream]}.` : `${['JPEG', 'H.264', 'HEVC'][requested]} không được thiết bị phát hỗ trợ; đã tự dùng ${['JPEG', 'H.264', 'HEVC'][stream]}.`);
});
window.piperos.on('remote:device-info', (device) => { $('deviceSummary').textContent = `${device.name || 'Android'} · Android ${device.androidVersion || '?'} · PiperOS Tool ${device.appVersion || '?'}`; });
window.piperos.on('remote:frame', ({ jpeg, sentAtMs }) => videoRenderer.renderJpeg(jpeg, sentAtMs).catch((error) => status(error.message, true)));
window.piperos.on('remote:video-config', (config) => {
  $('viewerTitle').textContent = `${['JPEG', 'H.264', 'HEVC'][config.stream]} · encoder ${config.fps} FPS`;
  videoRenderer.configure(config).catch((error) => {
    if (config.stream !== 0 && activeConnection && !fallbackAttempted) {
      fallbackAttempted = true;
      status(`${error.message} Đang kết nối lại ở chế độ JPEG tương thích…`, true);
      const compatible = { ...activeConnection.quality, stream: 0 };
      activeConnection.quality = compatible;
      pendingStreamMode = 0;
      window.piperos.disconnect().then(() => activeConnection?.kind === 'usb'
        ? window.piperos.usbConnect(activeConnection.serial, compatible)
        : window.piperos.connect(activeConnection.endpoint, compatible)
      ).catch((fallbackError) => status(`Không thể chuyển sang JPEG tương thích: ${fallbackError.message}`, true));
    } else status(error.message, true);
  });
});
window.piperos.on('remote:video-frame', (frame) => videoRenderer.decode(frame));
window.piperos.on('remote:audio-config', ({ sampleRate, channels }) => {
  if (Number.isInteger(sampleRate) && sampleRate >= 8_000 && sampleRate <= 192_000) audioRate = sampleRate;
  if (Number.isInteger(channels) && channels >= 1 && channels <= 2) audioChannels = channels;
  nextAudioAt = audioContext?.currentTime || 0;
});
window.piperos.on('remote:audio', (payload) => { try { playAudio(payload); } catch (error) { status(error.message, true); } });
window.piperos.on('remote:error', (message) => status(message, true)); window.piperos.on('remote:closed', () => { videoRenderer.close(); fitCanvas(); $('viewerTitle').textContent = 'Phiên đã ngắt'; $('streamStats').textContent = '-- × -- thực · -- FPS · -- Mbps · -- ms'; $('deviceSummary').textContent = 'Không còn thiết bị được kết nối'; $('viewerEmpty').hidden = false; if (!fallbackAttempted) activeConnection = null; if ($('remoteStatus').style.color !== 'var(--danger)') status('Đã ngắt kết nối'); });
