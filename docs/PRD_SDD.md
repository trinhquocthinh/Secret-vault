# 📋 PRODUCT REQUIREMENTS DOCUMENT (PRD) & SPEC-DRIVEN DEVELOPMENT (SDD)

* **Tên sản phẩm:** Zero-Vault (Enterprise Zero-Knowledge Password & 2FA Manager)
* **Phiên bản:** 1.1.0 (đối chiếu & đồng bộ hóa với source code thực tế)
* **Phân loại:** Local-First Offline-Capable Web Application *(chưa đóng gói PWA — xem NFR-02)*
* **Tác giả:** Principal Systems Architect & Security Engineer
* **Ngày phê duyệt:** 2026
* **Trạng thái triển khai:** Xem cột **Trạng thái** trong mỗi mục FR/NFR bên dưới và §6 để biết khoảng cách
  giữa yêu cầu và implementation thực tế. Chi tiết kỹ thuật đầy đủ: [`docs/TECH_SPEC.md`](./TECH_SPEC.md).

> **Ghi chú về tính chính xác:** Bản 1.1.0 đã được rà soát trực tiếp với source code trong `src/` (không
> chỉ dựa trên tài liệu cũ). Các yêu cầu vẫn giữ nguyên như mục tiêu sản phẩm (PRD mô tả "nên là gì"), nhưng
> mỗi mục được gắn nhãn trạng thái ✅ Đã triển khai / ⚠️ Triển khai một phần / ❌ Chưa triển khai để tài liệu
> không bị hiểu nhầm là toàn bộ đã hoàn thiện 100%.

---

## 1. TẦM NHÌN SẢN PHẨM (PRODUCT VISION)

Xây dựng một nền tảng quản lý mật khẩu, lưu trữ mã xác thực hai yếu tố (2FA/TOTP) và ghi chú bảo mật cá nhân hoạt động hoàn toàn trên trình duyệt với tiêu chuẩn an toàn mật mã học tương đương các sản phẩm hàng đầu như **1Password** hoặc **Bitwarden**.

Dự án chứng minh triết lý **"Zero-Server Cost ($0/month FinOps)"** bằng cách tận dụng sức mạnh tính toán tại máy khách (Client-side Cryptography) và lưu trữ phân tán cá nhân (BYOC - Bring Your Own Cloud), tuyệt đối tuân thủ nguyên tắc **"Không-Thể-Biết" (Zero-Knowledge Architecture)**.

---

## 2. CÁC NGUYÊN TẮC KIẾN TRÚC LÕI (CORE ARCHITECTURAL PRINCIPLES)

1. **Absolute Zero-Knowledge:** Máy chủ đồng bộ đám mây (Google Drive, Vercel) và ổ cứng trình duyệt tại thời điểm nghỉ (at-rest) không bao giờ nhìn thấy mật khẩu gốc (Master Password), khóa mã hóa (Master Key), hoặc bản rõ (Plaintext) của người dùng.
2. **Local-First & Offline-First:** Dữ liệu được tạo, mã hóa, giải mã và lưu trữ ưu tiên trên bộ nhớ cục bộ của thiết bị (IndexedDB). Internet chỉ đóng vai trò là kênh truyền tải phụ trợ để đồng bộ hóa bản mã (Ciphertext).
3. **Defense-in-Depth (Bảo mật nhiều lớp):** Mọi điểm chạm trong hệ thống—từ bộ nhớ RAM, Clipboard, DOM Events đến Network Headers—đều phải được trang bị cơ chế tự bảo vệ chủ động chống lại các vector tấn công vật lý và mạng.

---

## 3. MÔ HÌNH ĐE DỌA & CƠ CHẾ PHÒNG THỦ (THREAT MODEL & MITIGATIONS)

Dự án áp dụng mô hình đe dọa STRIDE và thiết lập ma trận phòng thủ cấp quân sự:

| Định danh | Mối đe dọa (Threat Vector) | Kịch bản tấn công (Attack Scenario) | Cơ chế phòng thủ & Giảm thiểu (Mitigation Strategy) |
| :--- | :--- | :--- | :--- |
| **T-01** | **Memory Dump Attack** | Mã độc hoặc script chạy nền chiếm quyền đọc bộ nhớ RAM của trình duyệt nhằm trích xuất Master Key hoặc mật khẩu đang lưu dưới dạng biến chuỗi (string). | Luôn xử lý dữ liệu nhạy cảm bằng `Uint8Array`. Sử dụng class `MemoryWiper` (`array.fill(0)`) để cưỡng chế ghi đè số 0 lên vùng nhớ RAM ngay sau khi thao tác mã hóa/giải mã hoàn tất. |
| **T-02** | **Clipboard Sniffing** | Các ứng dụng nền của hệ điều hành hoặc phần mềm độc hại theo dõi lịch sử Clipboard để đọc trộm mật khẩu người dùng vừa sao chép. | Tích hợp Custom Hook `useClipboardWiper`, tự động kích hoạt đếm ngược **30 giây** và ghi đè Clipboard bằng chuỗi rỗng (`""`) nếu người dùng chưa chép nội dung khác. |
| **T-03** | **Local DB Tampering** | Kẻ tấn công can thiệp trực tiếp vào file IndexedDB trên ổ cứng để thay đổi byte dữ liệu, nhằm chèn payload độc hại hoặc phá hoại hệ thống. | Áp dụng thuật toán **AES-GCM 256-bit** tích hợp mã xác nhận tính toàn vẹn (16-byte Auth Tag). Bất kỳ sự sai lệch dù là 1 bit cũng khiến Web Crypto API ném lỗi `OperationError` (Tampered Data) và từ chối giải mã. |
| **T-04** | **Cross-Tenant Data Leakage** | Người dùng B dùng chung trình duyệt hoặc thiết bị với Người dùng A, cố gắng xem metadata hoặc ghi đè dữ liệu Két sắt của A. | Cơ chế **Deterministic Dynamic Database Routing**: Tên database IndexedDB được dẫn xuất động bằng `SHA256(mật khẩu + namespace salt cố định)` (`ZeroKnowledgeVaultDB_${vaultId}`, xem TECH_SPEC §3.1). Dữ liệu của các user được cô lập hoàn toàn về mặt vật lý trên ổ đĩa. Lưu ý: đây chỉ là cơ chế routing tên DB, không thay thế cho độ mạnh của khóa mã hóa thực sự (luôn đi qua PBKDF2 600k rounds + salt riêng 16-byte). |
| **T-05** | **Cloud Storage Snooping** | Máy chủ đám mây, bên thứ ba hoặc các ứng dụng khác được cấp quyền vào Google Drive của user cố gắng quét trộm kho mật khẩu. | File đồng bộ `zero_knowledge_vault_sync.enc` được mã hóa E2EE và được lưu độc quyền tại vùng nhớ ẩn `appDataFolder` của Google Drive—nơi người dùng thông thường và các app khác không thể nhìn thấy hay truy cập. |
| **T-06** | **Local Brute-Force Attack** | Kẻ tấn công dùng script tự động gõ liên tục hàng ngàn mật khẩu vào màn hình mở khóa để dò tìm Master Password. | Tích hợp **Throttling Guardrail**: Lưu bộ đếm số lần nhập sai. Nếu thất bại quá 5 lần liên tiếp, hệ thống tự động đóng băng giao diện mở khóa trong 1 phút để ngăn chặn tấn công dò khóa nhanh. |

---

## 4. MA TRẬN YÊU CẦU CHỨC NĂNG (FUNCTIONAL REQUIREMENTS)

> Mỗi mục dưới đây được gắn nhãn trạng thái: **✅ Đã triển khai** (khớp code hiện tại) · **⚠️ Triển khai một
> phần** (có nhưng khác chi tiết so với mô tả gốc) · **❌ Chưa triển khai** (roadmap).

### FR-01: Xác thực Lõi & Dẫn xuất Khóa (Core Authentication)

* **FR-01.1** ✅ — Hệ thống phải sử dụng thuật toán **PBKDF2** với **600,000 vòng lặp** (chuẩn OWASP 2026), kết hợp Salt ngẫu nhiên 16-byte để dẫn xuất ra Khóa chính (`CryptoKey` 256-bit). *(`core/crypto/key-derivation.ts`)*
* **FR-01.2** ✅ — Hệ thống phải tích hợp cơ chế **"Canary Verifier"** (Huy hiệu xác thực hoàng yến). Khi tạo Két sắt, hệ thống mã hóa một chuỗi hằng số cố định (implementation dùng `"ZERO_KNOWLEDGE_VAULT_VALID_CANARY"`) và lưu vào bảng `meta` (`canaryCipherText`/`canaryIv`). Khi mở khóa, hệ thống thử giải mã Canary; nếu giải mã thành công mới mở giao diện, nếu thất bại phải từ chối ngay ở tầng Client. *(`useVault.unlockVault`, xem TECH_SPEC §2.4)*

### FR-02: Quản lý Két Sắt Mật Khẩu (Vault CRUD Operations)

* **FR-02.1** ✅ — Cho phép Tạo mới, Sửa đổi và Đọc danh sách bản ghi mật khẩu.
* **FR-02.2 (Lazy Decryption)** ⚠️ Triển khai một phần — Khi mở khóa, hệ thống giải mã **ngay (eager)** toàn bộ metadata cần hiển thị (Tiêu đề, Username, TOTP Secret — cần thiết để chạy đồng hồ TOTP real-time), KHÔNG đợi đến khi user thao tác. Chỉ riêng trường `password` mới thực sự **lazy**: giải mã tức thời vào RAM trong mili-giây khi người dùng bấm nút "Copy" hoặc "Sửa", sau đó không được giữ lại trong state UI. *(`useVault.fetchAndDecryptVault` / `getSecretPassword`, xem TECH_SPEC §3.3)*
* **FR-02.3 (Tombstone Soft Delete)** ✅ — Khi xóa một bản ghi, hệ thống không xóa cứng (Hard Delete) mà chỉ cập nhật cờ `isDeleted: true` và timestamp `updatedAt`. Đây là cơ sở để thông báo cho các thiết bị khác biết bản ghi đó đã bị xóa khi đồng bộ hóa. *(đánh số lại từ "FR-03.3" trong bản 1.0 — đây là một lỗi đánh số văn bản, không phải một yêu cầu FR-03 riêng)*

### FR-03: Trình Xác Thực 2FA / TOTP Offline (RFC 6238 Engine)

* **FR-03.1** ✅ — Tích hợp thư viện `jsQR` để quét mã QR 2FA trực tiếp qua Camera của thiết bị 100% offline. *(Lưu ý: hiện chỉ hỗ trợ quét qua luồng Camera trực tiếp — quét từ ảnh chụp màn hình tĩnh do người dùng tải lên chưa có UI riêng.)*
* **FR-03.2** ✅ — Tự xây dựng engine tính toán mã OTP 6 chữ số theo chuẩn **RFC 6238** (Time-based One-Time Password) dựa trên hàm băm `HMAC-SHA1` và bước nhảy thời gian `X = 30s`. Toàn bộ quá trình băm và cắt bit động (Dynamic Truncation) chạy offline trên RAM. *(`core/crypto/totp-engine.ts`)*
* **FR-03.3** ✅ — Hiển thị thanh tiến trình đếm ngược thời gian thực và đồng bộ hóa làm mới mã OTP theo đúng nhịp đồng hồ hệ thống mà không gây ra lỗi re-render liên hoàn (Zero Cascading Renders). *(`useLiveTOTP`)*

### FR-04: Tự Động Hóa Bảo Vệ Hệ Thống (Automated Security Guardrails)

* **FR-04.1 (Clipboard Wiper)** ✅ — Tự động đếm ngược 30 giây kể từ khi sao chép mật khẩu/OTP và ghi đè Clipboard (implementation ghi một khoảng trắng `" "` thay vì chuỗi rỗng `""`, để tương thích với các trình duyệt từ chối `writeText("")`) nếu clipboard vẫn còn giữ đúng giá trị vừa copy.
* **FR-04.2 (Inactivity Auto-Lock)** ✅ — Lắng nghe các sự kiện thao tác người dùng (`mousemove`, `mousedown`, `keydown`, `touchstart`, `scroll`). Nếu sau **5 phút** không có tín hiệu tương tác, hệ thống tự động hủy tham chiếu Master Key (`masterKeyRef.current = null`), dọn sạch state trong React, đóng kết nối DB và đẩy về màn hình Khóa.

### FR-05: Đồng Bộ Hóa Đám Mây Đa Thiết Bị (BYOC Distributed Sync)

* **FR-05.1** ✅ — Tích hợp xác thực ngầm (Silent OAuth2 Flow) qua Google Identity Services để lấy Token kết nối với Google Drive REST API v3 mà không gây làm phiền bằng pop-up liên tục. Khi đồng bộ ngầm (không phải do user bấm nút) chưa có token sẵn, hệ thống chủ động bỏ qua thay vì cố mở popup (tránh bị trình duyệt chặn). *(xem TECH_SPEC §5)*
* **FR-05.2** ✅ — Đồng bộ hóa file bảo mật vào vùng nhớ ẩn `drive.appdata` và thực hiện giải thuật gộp dữ liệu **Last-Write-Wins (LWW)** cấp bản ghi dựa trên timestamp để giải quyết xung đột khi sửa đổi trên nhiều thiết bị. Bổ sung so với bản PRD gốc: một giao thức **"Nhận nuôi Salt" (Salt Adoption + Forced Relogin)** xử lý đúng trường hợp lần đồng bộ đầu tiên trên thiết bị hoàn toàn mới (xem TECH_SPEC §4.2).
* **FR-05.3** ❌ **Chưa triển khai** — Tự động chạy **Tombstone Garbage Collection**: Xóa vĩnh viễn (Hard Delete) các bản ghi có cờ `isDeleted: true` đã offline hoặc quá hạn trên **30 ngày** khỏi cả Local DB và file đám mây nhằm tối ưu hóa dung lượng lưu trữ. Hiện tại tombstone tồn tại **vĩnh viễn**, không có cơ chế dọn dẹp tự động nào chạy — đây là một hạng mục backlog rõ ràng, không phải một tính năng đã hoàn thiện (xem TECH_SPEC §4.1, §8).

---

## 5. YÊU CẦU PHI CHỨC NĂNG (NON-FUNCTIONAL REQUIREMENTS)

* **NFR-01 (Hiệu năng)** ⚠️ Chưa có benchmark tự động — Thời gian mở khóa Két sắt (thực hiện 600,000 vòng lặp PBKDF2) được kỳ vọng không vượt quá **500ms** trên các thiết bị trung bình, và thời gian giải mã một bản ghi trong chế độ Lazy Decryption dưới **10ms**. Các con số này phù hợp với chi phí lý thuyết của PBKDF2-SHA256/600k trên phần cứng hiện đại, nhưng **chưa có một bài test hiệu năng tự động** (benchmark/CI) nào đo và khẳng định lại 2 ngưỡng này trong repo.
* **NFR-02 (Độ tin cậy & Offline)** ⚠️ Triển khai một phần — Nhờ kiến trúc Local-First (IndexedDB), ứng dụng **đã** hoạt động 100% đầy đủ tính năng CRUD và xem mã 2FA ngay cả khi ngắt kết nối Internet hoàn toàn (đồng bộ Cloud chỉ là lớp phụ trợ). Tuy nhiên yêu cầu "**đóng gói theo chuẩn PWA**" (installable, `manifest.json`, service worker, add-to-homescreen) **chưa được triển khai** — không có `vite-plugin-pwa`, không có manifest, `public/` chỉ có icon tĩnh. Xem TECH_SPEC §8.
* **NFR-03 (Bảo mật đường truyền & Host)** ✅ Đã triển khai (có lệch nhẹ dev/prod) — Tuân thủ chính sách **Content-Security-Policy (CSP)** và **Cross-Origin-Opener-Policy (COOP)** khắt khe để chống Clickjacking và tấn công thực thi mã chéo trang (XSS), cấu hình song song ở `index.html` (meta tag, áp dụng cả dev) và `vercel.json` (HTTP headers, chỉ áp dụng khi deploy Vercel). Hai lớp này hiện lệch nhẹ (`object-src`/`base-uri`/`form-action` chỉ có ở `vercel.json`) — xem TECH_SPEC §6 để biết chi tiết & khuyến nghị đồng bộ.

---

## 6. TRUY VẾT TRẠNG THÁI TRIỂN KHAI (IMPLEMENTATION STATUS TRACEABILITY)

Bảng tổng hợp nhanh để bất kỳ ai đọc PRD này cũng nắm được ngay yêu cầu nào đã xong, yêu cầu nào còn nợ,
mà không cần đọc lại toàn bộ TECH_SPEC:

| Yêu cầu | Trạng thái | Ghi chú ngắn |
| --- | --- | --- |
| FR-01.1 PBKDF2 600k + salt 16-byte | ✅ | Khớp 100% |
| FR-01.2 Canary Verifier | ✅ | Chuỗi canary thực tế khác 1 chữ so với PRD gốc (`_VALID_CANARY`) |
| FR-02.1 CRUD | ✅ | Khớp |
| FR-02.2 Lazy Decryption | ⚠️ | Chỉ `password` là lazy thật; metadata + TOTP secret giải mã eager lúc unlock |
| FR-02.3 Tombstone Soft Delete | ✅ | Khớp, đã có regression test |
| FR-03.1–3.3 TOTP/QR | ✅ | Khớp |
| FR-04.1 Clipboard Wiper | ✅ | Ghi `" "` thay vì `""` |
| FR-04.2 Auto-Lock | ✅ | Khớp |
| FR-05.1 Silent OAuth2 | ✅ | Có thêm phân biệt interactive/non-interactive để tránh popup bị chặn |
| FR-05.2 LWW Sync | ✅ | Có thêm giao thức Salt Adoption chưa từng được đặc tả trước đây |
| FR-05.3 Tombstone GC (30 ngày) | ❌ | **Chưa implement** — cần đưa vào backlog |
| NFR-01 Hiệu năng (500ms/10ms) | ⚠️ | Chưa có benchmark tự động xác nhận |
| NFR-02 PWA Offline Packaging | ⚠️ | Offline-first đã có; PWA installable thì chưa |
| NFR-03 CSP/COOP | ✅ | Có lệch nhẹ dev/prod, xem TECH_SPEC §6 |

Các dòng ❌/⚠️ nên được chuyển thành issue cụ thể trong backlog trước khi công bố phiên bản kế tiếp là
"Production/GA".
