<p align="center"><strong>PiperOS Tool PC</strong></p>

<p align="center">Windows companion cho <a href="https://github.com/Phi574/PiperOSTool-Android">PiperOS Tool Android</a>.</p>

## 3.2.4.beta

- **PiperOS View Remote:** nhận ảnh JPEG và âm thanh PCM từ Android qua cùng giao
  thức `PIPER_REMOTE_2`; hỗ trợ LAN discovery, QR, mã 6 số và USB Type-C qua ADB.
  Nút toàn màn hình phóng đúng bề mặt hình chiếu; ảnh giữ đúng tỉ lệ và dùng toàn bộ
  vùng xem khả dụng.
- **QR PC:** PC tự tạo QR một lần, điện thoại quét trong PiperOS View Remote, cấp
  quyền chia sẻ rồi PC tự kết nối vào phiên có xác nhận ở Android. Dữ liệu hình ảnh
  luôn đi thẳng trong mạng nội bộ.
- **Điều khiển Android:** gửi touch, Back và Home; Android luôn yêu cầu xác nhận
  phiên ở thiết bị đang chia sẻ trước khi video được truyền.
- **Firebase:** đăng nhập bằng đúng Firebase project của PiperOS Tool để lưu dấu
  phiên PC theo UID trong `users/{uid}/deviceSessions`. Phiên được mã hóa bằng
  Windows DPAPI và tự khôi phục sau khi mở lại PC; không lưu mật khẩu.
- **Apple Screen Mirroring:** khung native receiver AirPlay/RAOP, chạy như service
  companion có thể đóng gói trong MSI. Không dùng hay bao gồm thành phần Apple độc
  quyền hoặc nội dung DRM.

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
đóng gói thư mục `win-unpacked` thành MSI sau khi WiX được cài.

## USB Type-C và driver

App dùng ADB chuẩn qua `adb forward`; tab **USB Type-C** chỉ nhận thiết bị vật lý
trong `adb devices` (không dùng Wireless debugging). Trên Android, chọn **Chia sẻ qua
cáp USB (ADB)** và xác nhận chụp màn hình, sau đó bấm **Kết nối qua cáp USB** trên PC.
Cài signed Google/OEM USB driver, không cài
kernel driver không ký. Đọc hướng dẫn tại [resources/drivers/README.md](resources/drivers/README.md).

## Apple receiver

Đặt `PiperAirPlayReceiver.exe` đã build/ký vào `resources/airplay/` trước khi build
MSI. Ghi chú giấy phép và điều kiện phân phối ở
[third_party/airplay_receiver/NOTICE.md](third_party/airplay_receiver/NOTICE.md).

## License

GPL-3.0-only. Các binary receiver phân phối kèm mã nguồn tương ứng và giấy phép
của dependency.
