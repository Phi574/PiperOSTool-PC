<p align="center"><strong>PiperOS Tool PC</strong></p>

<p align="center">Windows companion cho <a href="https://github.com/Phi574/PiperOSTool-Android">PiperOS Tool Android</a>.</p>

## 3.2.5.beta

- **PiperOS View Remote:** nhận ảnh JPEG và âm thanh PCM từ Android qua cùng giao
  thức `PIPER_REMOTE_2`; hỗ trợ LAN discovery, QR, mã 6 số và USB Type-C qua ADB.
  Nút toàn màn hình phóng đúng bề mặt hình chiếu; ảnh giữ đúng tỉ lệ và dùng toàn bộ
  vùng xem khả dụng.
- **QR PC:** PC tự tạo QR một lần trên cổng cục bộ ổn định, điện thoại quét trong
  PiperOS View Remote và cấp quyền chia sẻ. PC tự kết nối vào phiên đã được xác thực
  bằng mã QR; dữ liệu hình ảnh luôn đi thẳng trong mạng nội bộ. Thanh viewer hiển thị
  model, phiên bản Android và phiên bản PiperOS Tool của thiết bị đang chiếu.
- **Điều khiển Android:** gửi touch, Back và Home; Android luôn yêu cầu xác nhận
  phiên ở thiết bị đang chia sẻ trước khi video được truyền.
- **Firebase:** đăng nhập bằng đúng Firebase project của PiperOS Tool để lưu dấu
  phiên PC theo UID trong `users/{uid}/deviceSessions`. Phiên được mã hóa bằng
  Windows DPAPI và tự khôi phục sau khi mở lại PC; không lưu mật khẩu.
- **Apple Screen Mirroring:** `PiperAirPlayReceiver.exe` khởi động UxPlay cùng
  Bonjour/mDNS và GStreamer đã được đóng gói trong MSI. Không dùng thành phần Apple
  độc quyền, không thay thế driver Apple USB và không hỗ trợ nội dung DRM.

## Build EXE và MSI

Yêu cầu: Node.js LTS, npm, Android platform-tools cho USB; WiX CLI nếu cần MSI (`winget install --id WiXToolset.WiXCLI --exact`).

```powershell
npm install
npm run dist
npm run msi
```

`resources/firebase-config.json` chỉ chứa cấu hình client Firebase công khai, không
bao giờ đưa service account, khóa quản trị hay `google-services.json` vào PC repo.

`npm run dist` tạo NSIS `.exe` và portable `.exe` trong `release/`. `npm run msi`
đóng gói thư mục `win-unpacked`, receiver AirPlay và dependency native thành MSI sau
khi WiX được cài. Bản MSI lớn hơn vì mang theo decoder, audio pipeline và mDNS.
MSI `3.2.5.1` có wizard chọn thư mục, thông báo GPLv3, tiến trình cài đặt và shortcut
trên Desktop/Start Menu. Vì cài vào `Program Files`, Windows sẽ yêu cầu UAC.

## USB Type-C và driver

App dùng ADB chuẩn qua `adb forward`; tab **USB Type-C** chỉ nhận thiết bị vật lý
trong `adb devices` (không dùng Wireless debugging). Trên Android, chọn **Chia sẻ qua
cáp USB (ADB)** và xác nhận chụp màn hình, sau đó bấm **Kết nối qua cáp USB** trên PC.
Cài signed Google/OEM USB driver, không cài
kernel driver không ký. Đọc hướng dẫn tại [resources/drivers/README.md](resources/drivers/README.md).

## Apple receiver

Pipeline build đặt `PiperAirPlayReceiver.exe`, UxPlay và dependency mDNS/GStreamer
vào `resources/airplay/` trước khi đóng gói MSI. Ghi chú giấy phép và điều kiện phân
phối ở [resources/airplay/NOTICE.md](resources/airplay/NOTICE.md).

## License

GPL-3.0-only. Các binary receiver phân phối kèm mã nguồn tương ứng và giấy phép
của dependency.
