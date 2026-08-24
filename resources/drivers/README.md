# PiperOS Connectivity Driver Package

PiperOS Tool PC does not install an unsigned kernel driver. USB Type-C screen
sharing uses the standard Android Debug Bridge transport, which is safer and
works with the signed driver distributed by Google or the phone manufacturer.

## Installation

1. Install **Google USB Driver** from Android Studio SDK Manager or install the
   signed OEM USB driver for the connected phone.
2. Enable Developer options and USB debugging on Android.
3. Connect the phone with a data-capable Type-C cable and accept the RSA prompt.
4. In PiperOS Tool PC choose **USB Type-C**, scan ADB devices, then connect using
   the session port and session credential displayed by PiperOS View Remote.

The installer checks for `adb.exe` in `ANDROID_SDK_ROOT/platform-tools`. Set
`PIPEROS_ADB_PATH` if platform-tools is installed elsewhere.

## Why no custom driver?

A Windows kernel driver requires WDK builds, EV/attestation signing and Hardware
Dev Center publishing. Shipping an unsigned driver would make Windows Security
warnings worse and does not improve ADB throughput. A future signed PiperOS
virtual audio driver can be supplied as a separate optional MSI feature.
