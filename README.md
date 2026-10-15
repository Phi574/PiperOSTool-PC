<p align="center"><strong>PiperOS Tool PC</strong></p>

<p align="center">Windows companion cho <a href="https://github.com/Phi574/PiperOSTool-Android">PiperOS Tool Android</a>.</p>

## 3.3.1-beta · PiperOS Tool PC V2

- Quét LAN gửi broadcast tới từng subnet IPv4 hoạt động, QR PC ưu tiên địa chỉ của
  tuyến mạng mặc định để tránh chọn nhầm VPN hoặc adapter ảo.
- Giới hạn tốc độ khung hình render theo FPS người dùng chọn, bao gồm cả luồng JPEG;
  chỉ số FPS tiếp tục phản ánh số khung hình thực sự hiển thị.
- Receiver AirPlay quảng bá tên PiperOS đã nhập và nút dừng kết thúc cả cây tiến
  trình native, tránh sót tiến trình receiver cũ phát tên `uxplay`.
- Báo lỗi App Check bằng hướng xử lý cho Firebase desktop; ứng dụng không phát hành
  token debug hoặc nhúng bí mật để né xác minh.

## 3.3.0.beta · PiperOS Tool PC V2

- Làm mới toàn bộ bố cục theo dạng thẻ gọn, bo góc và màu sắc đồng bộ với PiperOS
  Tool Android; giao diện tự chuyển sang bố cục dọc khi cửa sổ hẹp.
- Bỏ thanh menu File/Edit/View/Window/Help của Electron. Các thao tác dùng thường
  xuyên như cài đặt luồng, Back/Home, toàn màn hình và ngắt kết nối nằm ngay trong
  giao diện.
- Tách tỷ lệ hình chiếu khỏi kích thước cửa sổ, giữ đúng tỷ lệ ảnh và ánh xạ thao
  tác chạm vào vùng hình thật khi đổi dọc/ngang hoặc đổi kích thước cửa sổ.
- Kiểm tra bộ giải mã theo cả hai hướng màn hình; tự kết nối lại bằng JPEG tương
  thích nếu H.264/HEVC không khởi tạo được trên GPU của PC.
- Tăng độ ổn định khi kết nối lại nhanh, bỏ sự kiện đến từ socket phiên cũ, giới
  hạn thời gian bắt tay và dữ liệu đệm; giới hạn hàng chờ âm thanh để tránh trễ kéo
  dài sau khi mạng khựng.
- Thêm đường vẽ Canvas 2D dự phòng khi WebGL không khả dụng; giữ pipeline giải mã
  WebCodecs + WebGL/ANGLE D3D11 khi GPU hỗ trợ.

- Piper Remote 3 có ba pipeline: JPEG tương thích, MediaCodec H.264 phần cứng và
  MediaCodec HEVC phần cứng.
- H.264/HEVC được giải mã bằng WebCodecs ưu tiên hardware, sau đó render bằng
  WebGL/ANGLE trên GPU (D3D11 trên Windows) thay vì Canvas 2D.
- Bộ chọn codec nằm tại nút cài đặt của khung chiếu; H.264 là mặc định an toàn.
- Hàng đợi độ trễ thấp tự bỏ frame delta cũ khi GPU chậm, giữ hình trực tiếp thay
  vì tích lũy độ trễ.
- Thanh trạng thái dùng telemetry thực: kích thước frame decoder đang render, FPS
  đã render, Mbps nhận trên đường truyền và độ trễ từ dấu thời gian Android tới lúc
  frame xuất hiện trên PC. Các số này không lấy từ lựa chọn chất lượng mong muốn.

- **PiperOS View Remote:** nhận JPEG/H.264/HEVC và âm thanh PCM từ Android qua giao
  thức `PIPER_REMOTE_4`; hỗ trợ LAN discovery, QR, mã 6 số và USB Type-C qua ADB.
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
Firebase App Check không có provider attestation tích hợp cho Windows desktop. Nếu
Firebase Authentication bật Enforcement, bản PC cần custom provider và backend an
toàn để cấp token. Nếu chưa có backend đó, hãy tắt Enforcement riêng cho
Authentication trong Firebase Console để cho phép PC đăng nhập.

`npm run dist` tạo NSIS `.exe` và portable `.exe` trong `release/`. `npm run msi`
đóng gói thư mục `win-unpacked`, receiver AirPlay và dependency native thành MSI sau
khi WiX được cài. Bản MSI lớn hơn vì mang theo decoder, audio pipeline và mDNS.
MSI `3.3.1.1` có wizard chọn thư mục, thông báo GPLv3, tiến trình cài đặt và shortcut
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
