# Android Platform-Tools

This folder contains the ADB executable and its required Windows DLLs from the
Android SDK Platform-Tools installation used to build PiperOS Tool PC.

PiperOS Tool PC starts its own local ADB server and detects authorized,
unauthorized, and offline devices. Windows still requires the signed USB driver
for the connected Android device (Google USB Driver or the device OEM driver).
The app never installs a kernel driver or bypasses USB debugging confirmation.
