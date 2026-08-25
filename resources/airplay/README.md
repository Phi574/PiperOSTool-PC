# PiperOS AirPlay Receiver Native Host

`PiperAirPlayReceiver.exe` is built locally for Windows x64 and placed in this
folder by the MSI build pipeline. Release binaries are ignored by Git; the MSI
payload generator includes the native host together with its UxPlay runtime.

The Electron app starts it with device name, target resolution and FPS. It is
responsible for AirPlay/RAOP advertisement, H.264/H.265 decode, low-latency
audio output and rotation-aware rendering.

Use the upstream GPL-compatible AirPlay receiver source recorded in
[`NOTICE.md`](NOTICE.md). Preserve its license and source offer when distributing
the Windows binary.
