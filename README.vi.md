<div align="center">
  <img src="assets/yumeshelf_icon_highres_4096.png" alt="YumeShelf" width="180" height="180">
  <h1>YumeShelf</h1>
  <p><b>Trình quản lý và khởi chạy bộ sưu tập game cá nhân theo phong cách tối giản.</b></p>

  <p>
    <a href="README.md">English</a> | 
    <a href="README.vi.md">Tiếng Việt</a> | 
    <a href="README.zh.md">简体中文</a> | 
    <a href="README.ja.md">日本語</a>
  </p>
</div>

---

## Tiếng Việt

Nếu ổ game của bạn là một đống lộn xộn mấy thư mục kiểu `[v1.2.5]_game_name_pc` với mã `RJ123456`, cái này dành cho bạn.

Chỉ cần trỏ YumeShelf vào folder game là xong. Nó sẽ tự gom mọi thứ vào một giao diện gọn gàng, lấy đúng tên game với icon để bạn khỏi phải đi mò file .exe nữa.

### Nó làm được gì

- **Khỏi phải đi mò file**: Tự tìm file chạy nằm sâu trong mấy folder con, tự xóa mấy cái tag linh tinh của uploader.
- **Tự tìm và sửa file save**: Tự mò ra chỗ game giấu save (AppData, Ren'Py, Linux XDG, Wine prefix) và có sẵn trình sửa save để chỉnh vàng, biến số, switch cho game RPG Maker, Ren'Py, Unity, Wolf RPG ngay trong app.
- **Dùng tốt trên cả Windows lẫn Linux**: Chạy được luôn trên Windows và Linux (`.AppImage` & `.tar.gz`), không cần cài đặt rườm rà.
- **Cài dịch tự động 1-click**: Tự thả bộ XUnity.AutoTranslator vào game khỏi mất công copy tay.
- **Đếm giờ chơi**: Xem bạn đã chơi mỗi game được bao nhiêu tiếng.

### Bắt đầu nhanh

1. Tải bản mới nhất ở [GitHub Releases](https://github.com/loerei/YumeShelf/releases/latest).
   - **Windows**: Chạy file `YumeShelf-Setup-<version>.exe`.
   - **Linux**: Tải `YumeShelf-<version>.AppImage`, cấp quyền chạy (`chmod +x`) rồi mở lên.
2. Lần đầu mở thì chọn folder game của bạn, hoặc bấm "Tôi lười quá" để app tự tạo folder mặc định.
3. Click đúp vào game để chơi.

### Cảnh báo Antivirus (Báo nhầm)

Vì đây là tool mã nguồn mở tự làm và không có tiền mua chứng chỉ doanh nghiệp đắt đỏ, Windows SmartScreen hay Windows Defender có thể sẽ báo linh tinh. Đây là chuyện bình thường với app desktop nguồn mở. Bạn cứ bấm "More info" -> "Run anyway" là được, hoặc vào GitHub tự xem code.

### Tri ân & Đóng góp (Acknowledgements & Credits)

YumeShelf và nhân phân tích **YumeEngine** được phát triển dựa trên các công trình mã nguồn mở tuyệt vời từ cộng đồng:

- **[Detect-It-Easy](https://github.com/horsicq/Detect-It-Easy) / [XPEViewer](https://github.com/horsicq/XPEViewer)** (`horsicq`) — Thuật toán nhận diện nhị phân, phân tích cấu trúc PE và chữ ký engine.
- **[XUnity.AutoTranslator](https://github.com/bbepis/XUnity.AutoTranslator)** (`bbepis`) — Kiến trúc dịch thuật thời gian thực và mô hình hook plugin cho Unity.
- **[BepInEx](https://github.com/BepInEx/BepInEx)** — Framework mod và tiêm mã runtime cho Unity & .NET.

### Đóng góp

YumeShelf là phần mềm mã nguồn mở và liên tục phát triển. Mọi đóng góp thử nghiệm trên các bản phân phối Linux, bản dịch, ý tưởng tính năng hoặc báo lỗi đều rất được hoan nghênh.
