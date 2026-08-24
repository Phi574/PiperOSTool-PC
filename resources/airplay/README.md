# PiperOS AirPlay Receiver Native Host

`PiperAirPlayReceiver.exe` is intentionally not committed as a binary. The
native host must be built for Windows x64, signed and placed in this folder by
the MSI build pipeline.

The Electron app starts it with device name, target resolution and FPS. It is
responsible for AirPlay/RAOP advertisement, H.264/H.265 decode, low-latency
audio output and rotation-aware rendering.

Use the upstream GPL-compatible AirPlay receiver source recorded in
`third_party/airplay_receiver/NOTICE.md`. Preserve its license and source offer
when distributing the Windows binary.
