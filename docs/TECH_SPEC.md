# ⚙️ TECHNICAL SPECIFICATION (TECH SPEC) & ARCHITECTURE DESIGN

* **Tên tài liệu:** Zero-Vault Technical Specification
* **Kiến trúc hệ thống:** Client-Side Zero-Knowledge / Feature-Sliced Clean Architecture
* **Tác giả:** Principal Systems Architect & Security Engineer
* **Phiên bản tài liệu:** 1.2 (đối chiếu & đồng bộ hóa với source code thực tế)
* **Tình trạng:** Approved — reflects verified implementation as of 2026-07-21

> **Ghi chú về tính chính xác:** Bản 1.2 cập nhật 3 mảng lớn phát sinh sau bản 1.1 (2026-07-18): (1) UI
> được rebrand hiển thị thành **"Vùng bảo mật"** + toàn bộ redesign bằng Tailwind CSS v4/lucide-react/
> framer-motion (pipeline Tailwind trước đây bị flag là gap ⚠️ nay đã có thật), (2) tính năng **mở khóa
> sinh trắc học (WebAuthn PRF)** và **đổi Master Password (key rotation)** hoàn toàn mới, chưa từng được
> đặc tả ở bản 1.1, (3) PBKDF2 giờ chạy trong một **Web Worker riêng** thay vì main thread. Mọi công thức,
> tên trường dữ liệu và luồng xử lý dưới đây đều trỏ thẳng tới file và hàm cụ thể để tránh tài liệu bị
> "trôi" (doc drift) so với implementation.

---

## 1. KIẾN TRÚC HẠT NHÂN & ĐỊNH TUYẾN THƯ MỤC (CLEAN ARCHITECTURE + FSD)

Dự án áp dụng triệt để nguyên tắc **Separation of Concerns (Phân tách mối quan tâm)** bằng cách chia ranh giới rõ ràng giữa vùng **Framework-Agnostic (Thuần TypeScript - Core)** và vùng **Framework-Specific (Phụ thuộc React 19 - Features)**:

```text
src/
├── core/                              # [FRAMEWORK-AGNOSTIC] Thuần TypeScript / Native Web APIs
│   ├── crypto/
│   │   ├── aes-gcm.ts                 # Engine mã hóa/giải mã AES-GCM 256-bit & GCM Auth Tag
│   │   │                              # (encrypt/decrypt cho JSON string + encryptRaw/decryptRaw cho
│   │   │                              #  ArrayBuffer thô, dùng để wrap/unwrap Master Key sinh trắc học)
│   │   ├── key-derivation.ts          # PBKDF2-SHA256 (600,000 rounds) Key Derivation & Salt Generator
│   │   ├── crypto.worker.ts           # Web Worker thực thi PBKDF2 ngoài Main Thread (type: module)
│   │   ├── worker-client.ts           # KeyDerivationWorkerClient — Singleton client giao tiếp Worker
│   │   │                              # qua postMessage + Transferable Uint8Array (zero-copy)
│   │   ├── webauthn-prf.ts            # WebAuthnPrfEngine — đăng ký/xác thực Credential + PRF Extension
│   │   │                              # dùng làm KEK bọc (wrap) Master Key cho mở khóa sinh trắc học
│   │   ├── memory-wiper.ts            # Class chuyên dụng cưỡng chế ghi đè Uint8Array/ArrayBuffer .fill(0)
│   │   ├── totp-engine.ts             # Thuật toán RFC 6238 (HMAC-SHA1 Dynamic Truncation Engine)
│   │   │                              # + isValidBase32Secret() validate secret trước khi lưu
│   │   └── crypto.test.ts             # Vitest unit tests cho AES-GCM / PBKDF2 / TOTP
│   └── storage/
│       ├── dexie-client.ts            # Dynamic Database Factory (IndexedDB Wrapper cho Multi-tenant)
│       │                              # VaultMeta giờ có thêm biometricCredentialId/wrappedMasterKey/
│       │                              # wrappedKeyIv (Phase 4 — biometric unlock)
│       ├── google-drive-client.ts     # REST API v3 Client (appDataFolder + Silent/Interactive OAuth2 GIS)
│       ├── vault-sync-engine.ts       # LWW Merge Engine + Salt-Adoption Cross-Device Protocol
│       ├── vault-migration-engine.ts  # Key Rotation Engine — đổi Master Password: giải mã toàn bộ record
│       │                              # bằng khóa cũ, mã hóa lại bằng khóa mới + IV mới, migrate sang DB
│       │                              # tên mới, VÀ lọc bỏ (garbage-collect) tombstone quá 30 ngày
│       ├── vault-sync-repro.test.ts       # Regression test: cross-device salt adoption + forced relogin
│       ├── vault-sync-tombstone.test.ts   # Regression test: tombstone anti-resurrection + LWW ordering
│       └── vault-migration.test.ts        # Regression test: key rotation re-encryption + tombstone GC
├── features/                          # [FRAMEWORK-SPECIFIC] React 19 Ecosystem & Hooks
│   ├── auth/
│   │   ├── components/UnlockModal.tsx     # Form nhập Master Password + nút mở khóa sinh trắc học
│   │   └── hooks/useBiometric.ts          # Hook UX-gate: show/hide nút vân tay + throwaway assertion
│   │                                      # trước khi gọi unlockWithBiometric() thật của useVault
│   ├── vault/
│   │   ├── components/                    # VaultDashboard, SecretCard, SyncButton, ChangePasswordForm
│   │   └── hooks/                          # useVault (CRUD + unlock + biometric + đổi mật khẩu),
│   │                                        # useVaultSync, useClipboardWiper
│   ├── totp/
│   │   ├── components/QrScannerModal.tsx  # Camera QR Scanner (jsQR), parser otpauth://
│   │   └── hooks/useLiveTOTP.ts           # Vòng lặp đếm ngược 30s + tự tính lại OTP theo chu kỳ
│   │                                      # + trả về isOtpReady để UI không render nhầm chuỗi lỗi/loading
│   └── security/
│       └── hooks/useAutoLock.ts           # Inactivity Auto-Lock Timer (5 phút) + remainingSeconds countdown
├── shared/                            # UI primitives dùng chung — KHÔNG còn trống (xem 1.1 bên dưới)
│   ├── components/Modal.tsx               # Overlay/glass-card wrapper dùng chung cho mọi modal
│   ├── components/ToastContainer.tsx      # Toast list (success/error/info), thay thế alert()/console.log
│   └── hooks/useToast.ts                  # { toasts, showToast(message, type) }
├── types/                             # Global ambient declarations (google.d.ts, jsqr.d.ts)
└── App.tsx                            # Entry point — hiện tại chỉ render <VaultDashboard />
```

> **Lưu ý triển khai:** `App.tsx` hiện KHÔNG có Provider/Context wiring — toàn bộ state (vault, sync,
> auto-lock, clipboard, biometric) được sở hữu và truyền tay bởi `VaultDashboard.tsx` qua các custom hook
> ở trên. `shared/` (trước đây "reserved", trống) nay chứa các UI primitive dùng chung được thêm trong đợt
> redesign giao diện bằng Tailwind CSS v4.

## 2. ĐẶC TẢ THUẬT TOÁN MẬT MÃ HỌC (CRYPTOGRAPHIC SPECIFICATION)

Toàn bộ hệ thống sử dụng 100% Native Web Crypto API (engine C++ của trình duyệt), từ chối mọi thư viện mật mã JavaScript bên thứ ba nhằm đạt hiệu năng tối đa và phòng chống tấn công Side-Channel.

### 2.1. Dẫn Xuất Khóa (Key Derivation Engine) — `core/crypto/key-derivation.ts`

* **Thuật toán:** PBKDF2 (Password-Based Key Derivation Function 2).
* **Hàm băm:** SHA-256.
* **Số vòng lặp (Iterations):** `600,000` (hằng số `PBKDF2_ITERATIONS`, chuẩn OWASP 2023+).
* **Salt:** `Uint8Array` ngẫu nhiên **16 bytes** (`crypto.getRandomValues`), sinh ra duy nhất một lần khi khởi tạo Két sắt lần đầu và lưu tại bảng `meta` trong IndexedDB (`VaultMeta.salt`).
* **Đầu ra:** `CryptoKey` AES-GCM 256-bit với `extractable: true` — **đã đổi từ `false` sang `true`** kể từ khi tính năng mở khóa sinh trắc học (2.6) được thêm vào, vì `enableBiometric()` cần `crypto.subtle.exportKey("raw", masterKeyRef.current)` để lấy bytes thô rồi bọc (wrap) bằng khóa KEK sinh trắc học. Đây là một đánh đổi bảo mật có chủ đích (không phải sơ suất): bản thô xuất ra luôn bị `MemoryWiper.wipe()` ngay sau khi wrap/import xong, và khóa AES-GCM vẫn không bao giờ rời khỏi tiến trình trình duyệt (không network call nào truyền nó đi).
* **Thực thi ngoài Main Thread (Web Worker):** Từ bản 1.2, `deriveKey()` KHÔNG còn chạy trực tiếp trên Main Thread. `KeyDerivationWorkerClient` (`core/crypto/worker-client.ts`) khởi tạo một `Worker` singleton (`core/crypto/crypto.worker.ts`, `type: "module"`) và gửi `passwordBuffer`/`salt` sang qua `postMessage` với `passwordBuffer.buffer` nằm trong danh sách Transferables (mảng thứ 2 của `postMessage`) — quyền sở hữu vùng nhớ bị tước khỏi Main Thread ngay lập tức (zero-copy), giữ cho UI mượt (không bị block 600k vòng PBKDF2) và giảm thời gian tồn tại của buffer mật khẩu thô trên luồng chính. Worker trả kết quả (`key`, `salt`) qua `onmessage`, được map lại theo `id` (`crypto.randomUUID()`) tới đúng Promise đang chờ trong `pendingTasks`.
* **Vệ sinh bộ nhớ:** `passwordBuffer` (Uint8Array chứa mật khẩu thô) luôn bị `MemoryWiper.wipe()` trong khối `finally`, kể cả khi `deriveKey` ném lỗi.

```ts
// core/crypto/key-derivation.ts (rút gọn, khớp 1:1 với implementation)
const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTE_LENGTH = 16;
const KEY_LENGTH_BITS = 256;

const derivedKey = await crypto.subtle.deriveKey(
  { name: "PBKDF2", salt: actualSalt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
  baseKey,
  { name: "AES-GCM", length: KEY_LENGTH_BITS },
  true, // extractable — cần cho biometric key wrapping, xem §2.6
  ["encrypt", "decrypt"],
);
```

> ⚠️ **Không dùng Argon2id.** Chỉ PBKDF2-SHA256 được implement. (Bản Tech Spec trước có nhắc tới Argon2id
> trong một dòng comment nhưng không tồn tại code path nào dùng nó — đã được gỡ khỏi tài liệu này để tránh
> hiểu nhầm.)

### 2.2. Mã Hóa & Xác Thực Tính Toàn Vẹn (AES-GCM 256-bit) — `core/crypto/aes-gcm.ts`

* **Thuật toán:** AES-GCM 256-bit.
* **Initialization Vector (IV):** `12 bytes` (`IV_BYTE_LENGTH`) ngẫu nhiên độc nhất cho **mỗi lần gọi `encrypt()`** — kể cả khi mã hóa lại (re-encrypt) cùng một record trong thao tác Update. Không bao giờ tái sử dụng cặp (Key, IV) → loại bỏ hoàn toàn lỗ hổng IV Reuse (2 bản mã dùng chung Key+IV sẽ lộ XOR của 2 bản rõ).
* **Authentication Tag (GCM Tag):** 16 bytes (128-bit), tự động đính kèm bởi Web Crypto API vào ciphertext.
* **Xử lý lỗi giải mã:** Mọi lỗi từ `crypto.subtle.decrypt` (sai khóa HOẶC dữ liệu bị can thiệp) được bọc lại thành `"Giải mã thất bại: Khóa không đúng hoặc dữ liệu đã bị can thiệp trái phép (Tampered Data)."` — không phân biệt 2 nguyên nhân này ra ngoài để tránh oracle attack.
* **Vệ sinh bộ nhớ:** Cả plaintext-encoded-buffer (trước khi mã hóa) và decrypted-buffer (sau khi giải mã) đều bị `MemoryWiper` ghi đè `0x00` ngay sau khi dùng xong.

### 2.3. Trình Xác Thực RFC 6238 (TOTP Engine) — `core/crypto/totp-engine.ts`

* Tự viết bộ giải mã **Base32 (RFC 4648)** thủ công, không dùng thư viện ngoài.
* Ký `HMAC-SHA1` trên bộ đếm thời gian 8-byte Big-Endian (`counter = floor(epoch / 30)`) bằng `crypto.subtle.sign`.
* **Dynamic Truncation (RFC 4226):** cắt 4 byte từ offset `hash[19] & 0xF`, mask bit cao nhất (`& 0x7F`), rồi `% 1_000_000` để ra mã 6 chữ số, `padStart(6, "0")`.
* Secret key thô, counter buffer và HMAC signature đều bị `MemoryWiper.wipe()` ngay sau khi tính xong mã OTP.
* 100% offline — không có network call nào trong toàn bộ quy trình sinh mã.

### 2.4. Quy trình Xác thực Hoàng Yến (Canary Verification Flow) — `useVault.unlockVault`

```text
[User nhập Master Password (Uint8Array qua TextEncoder)]
             │
             ▼
[deriveVaultId(password)] = SHA-256(password + "vault_id_namespace_salt") → hex, cắt lấy 32 ký tự đầu
             │
             ▼
[Mở DB: `ZeroKnowledgeVaultDB_${vaultId}` qua DynamicVaultDatabase] ──► await dbInstance.open()
             │
             ▼
[Đọc bản ghi `meta.get("VAULT_CONFIG")`]
             │
             ├──► KHÔNG tồn tại (Két sắt mới) ──► Sinh Salt 16-byte mới ──► PBKDF2 deriveKey()
             │                                    ──► Mã hóa CANARY_STRING ("ZERO_KNOWLEDGE_VAULT_VALID_CANARY")
             │                                    ──► Lưu {id:"VAULT_CONFIG", salt, canaryCipherText, canaryIv}
             │
             └──► ĐÃ tồn tại ──► PBKDF2 deriveKey(password, meta.salt)
                                 ──► Thử giải mã meta.canaryCipherText / meta.canaryIv
                                        │
                                        ├──► Thành công & khớp CANARY_STRING ──► masterKeyRef.current = key
                                        │                                        ──► fetchAndDecryptVault()
                                        │                                        ──► XÁC THỰC ĐÚNG, mở UI
                                        │
                                        └──► Lỗi giải mã / chuỗi không khớp ──► throw "INVALID_PASSWORD"
                                                                              ──► Tăng bộ đếm brute-force (2.5)
```

### 2.5. Chống Brute-Force cục bộ (Local Throttling Guardrail) — `useVault.ts`

* Bộ đếm `vault_attempts` và mốc thời gian khóa `vault_lockout` được lưu trong `localStorage` (per-origin, tồn tại qua reload trang — không reset khi F5).
* `MAX_ATTEMPTS = 5`. Sau lần sai thứ 5, `vault_lockout = Date.now() + 60_000` (`LOCKOUT_DURATION_MS`, **1 phút**) và `unlockVault()` từ chối ngay từ đầu hàm (trước cả khi chạy PBKDF2) với thông báo còn lại bao nhiêu giây.
* Nhập đúng mật khẩu sẽ xóa cả hai key khỏi `localStorage` (`removeItem`).
* **Giới hạn đã biết:** Đây là throttling phía client, không chống được kẻ tấn công xóa `localStorage`/dùng DevTools/Incognito để reset bộ đếm. Vì kiến trúc Zero-Knowledge không có server để rate-limit tập trung, đây là lớp phòng thủ "cản trở người dùng vô tình/kẻ tấn công không rành kỹ thuật", không phải chống brute-force offline lên chính file IndexedDB (kẻ tấn công có quyền đọc ổ đĩa vẫn có thể copy file DB ra ngoài và brute-force PBKDF2 mà không bị giới hạn — mitigated bởi chi phí 600k rounds/lần thử).

### 2.6. Mở Khóa Sinh Trắc Học — WebAuthn PRF Key Wrapping (`core/crypto/webauthn-prf.ts`, `useVault.ts`)

Tính năng hoàn toàn mới so với bản Tech Spec 1.1, cho phép mở khóa bằng Touch ID / Face ID / Windows Hello
mà **không cần chạy lại PBKDF2** (~50ms thay vì ~500ms), bằng cách bọc (wrap) sẵn Master Key đã dẫn xuất
bằng một khóa đối xứng (KEK) lấy từ WebAuthn **PRF Extension** — không phải bằng cách lưu lại mật khẩu.

* **Đăng ký (`enableBiometric`)**: yêu cầu Két sắt đang mở khóa (đã có `masterKeyRef.current`). Quy trình:
  1. Kiểm tra `WebAuthnPrfEngine.isSupported()` (cần `PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()` trả `true`).
  2. `WebAuthnPrfEngine.registerBiometric(vaultId, "Zero-Vault User")` → tạo `PublicKeyCredential` mới với `extensions: { prf: {} }`, xác nhận `getClientExtensionResults().prf.enabled === true` (nếu không, throw lỗi rõ ràng — không phải mọi trình duyệt/phần cứng hỗ trợ PRF).
  3. Xuất Master Key hiện tại ra `ArrayBuffer` thô (`crypto.subtle.exportKey("raw", ...)`), mã hóa (wrap) nó bằng `AesGcmEngine.encryptRaw(rawMasterKey, prfSymmetricKey)`, rồi `MemoryWiper.wipe()` bản thô ngay lập tức.
  4. Lưu `biometricCredentialId`, `wrappedMasterKey`, `wrappedKeyIv` vào `VaultMeta` (bảng `meta`, cùng record `VAULT_CONFIG`) + đánh dấu `localStorage["ZERO_VAULT_BIOMETRIC_DB"] = vaultId` để `useBiometric.ts` biết DB nào đã bật sinh trắc học mà không cần mở khóa trước.
* **Mở khóa (`unlockWithBiometric`)**: đọc `meta.biometricCredentialId`/`wrappedMasterKey`/`wrappedKeyIv` → gọi `WebAuthnPrfEngine.authenticateBiometric(credentialId)` để lấy lại đúng `prfSymmetricKey` (WebAuthn PRF đảm bảo cùng challenge tĩnh + cùng Credential luôn sinh cùng một khóa) → `AesGcmEngine.decryptRaw(...)` giải mã (unwrap) ra Master Key thô → `crypto.subtle.importKey("raw", ..., true, ...)` (import lại `extractable: true`, để nếu người dùng bật lại biometric ngay trong phiên này thì export/wrap vẫn hoạt động) → **vẫn giải mã lại Canary** để xác nhận (defense-in-depth, không tin tưởng mù quáng vào việc unwrap thành công).
* **Hủy kích hoạt (`disableBiometric`)**: xóa 3 trường `biometricCredentialId`/`wrappedMasterKey`/`wrappedKeyIv` khỏi `meta` + xóa cờ `localStorage`.
* **Hook UX-gate riêng (`features/auth/hooks/useBiometric.ts`)**: là một lớp mỏng phía trên, KHÔNG chứa logic mở khóa thật — chỉ (a) kiểm tra `hasBiometric` bằng cách mở tạm một `DynamicVaultDatabase` từ tên đã lưu trong `localStorage` rồi đọc `meta.get("VAULT_CONFIG").biometricCredentialId` để quyết định có hiện nút vân tay trên `UnlockModal` hay không, và (b) chạy một `navigator.credentials.get()` xác thực "throwaway" (không dùng kết quả PRF của lần gọi này) trước khi gọi `unlockWithBiometric()` thật của `useVault.ts`. **Lưu ý đã sửa lỗi:** hook này từng đọc/ghi `meta` dưới id sai `"ZERO_VAULT_META"` (không khớp hằng số `META_ID = "VAULT_CONFIG"` dùng xuyên suốt phần còn lại của app) khiến `hasBiometric` luôn `false` dù đã đăng ký thành công — đã fix ở 4 vị trí trong file để dùng đúng `"VAULT_CONFIG"`.
* **An toàn nếu mất thiết bị:** kẻ tấn công cần cả (1) thiết bị vật lý VÀ (2) vượt qua chính cảm biến sinh trắc học/PIN của hệ điều hành (WebAuthn platform authenticator) — Master Key không bao giờ rời khỏi trình duyệt, và Canary vẫn được xác minh lại sau khi unwrap.

### 2.7. Xử lý TOTP Secret không hợp lệ (Base32 Validation)

* `TotpEngine.isValidBase32Secret(secretBase32)`: thử `base32ToUint8Array()` trong khối `try/catch`, trả `true` nếu decode ra ít nhất 1 byte, `false` nếu ném lỗi. Được `VaultDashboard.handleSaveSecret` gọi **trước khi lưu** — chặn việc lưu một TOTP secret không hợp lệ ngay từ đầu (hiển thị toast lỗi, không đóng modal), thay vì để lỗi xuất hiện âm thầm sau này khi tính OTP.
* `useLiveTOTP` cũng trả thêm `isOtpReady: /^\d{6}$/.test(otp)` để các nơi hiển thị (ví dụ `SecretCard.tsx`) phân biệt được 3 trạng thái: đang tính (`""`), lỗi (`"ERROR"`, khi secret cũ đã lỡ lưu invalid từ trước khi có validation này), và sẵn sàng (6 chữ số) — tránh hiển thị chuỗi cắt lát vô nghĩa (vd. "ERR" / "OR ") khi `otp` không phải 6 chữ số.

## 3. ĐẶC TẢ LƯU TRỮ CỤC BỘ & CÔ LẬP ĐA NGƯỜI DÙNG (LOCAL STORAGE & MULTI-TENANCY)

Hệ thống loại bỏ hoàn toàn việc dùng chung một file IndexedDB tĩnh. Để giải quyết bài toán nhiều người dùng trên cùng thiết bị (Multi-Tenant Local Isolation), ứng dụng áp dụng Factory Pattern qua `DynamicVaultDatabase` (`core/storage/dexie-client.ts`).

### 3.1. Cơ Chế Định Tuyến Cơ Sở Dữ Liệu Động (Dynamic Routing)

Tên cơ sở dữ liệu được dẫn xuất **quyết định tính (Deterministic)** bằng cách băm mật khẩu gốc cộng thêm một namespace salt cố định trong code (KHÔNG phải salt PBKDF2 dùng để mã hóa dữ liệu — đây là 2 salt độc lập, mục đích khác nhau):

$$\text{VaultId} = \operatorname{SHA256}(\text{MasterPassword} + \texttt{"vault\_id\_namespace\_salt"})\big[0:32\text{ hex chars}\big]$$
$$\text{VaultDatabaseName} = \texttt{"ZeroKnowledgeVaultDB\_"} + \text{VaultId}$$

**Hệ quả:** Người dùng A và Người dùng B (mật khẩu khác nhau) sở hữu 2 file IndexedDB vật lý hoàn toàn tách biệt trên ổ đĩa, đảm bảo cô lập dữ liệu 100% mà không cần bất kỳ cơ chế đăng nhập/tài khoản nào.

> **Lưu ý bảo mật:** Vì `VaultId` chỉ lấy 128-bit đầu của SHA-256(password + salt cố định public trong
> source code), đây **không phải** là một cơ chế bảo mật chống dò mật khẩu (không có secret/pepper phía
> server) — vai trò duy nhất của nó là routing tên database, không liên quan đến độ mạnh của khóa mã hóa
> (khóa mã hóa thực sự luôn đi qua PBKDF2 600k rounds + salt riêng 16-byte ở bảng `meta`).

### 3.2. Cấu Trúc Schema Chuẩn (Dexie TypeScript Schema — khớp 100% với `dexie-client.ts`)

```ts
export interface VaultRecord {
  id: string;                  // UUID v4 định danh bản ghi
  cipherText: ArrayBuffer;     // TOÀN BỘ payload (title, username, password, totpSecret) dưới dạng
                                // 1 khối JSON đã mã hóa AES-GCM — KHÔNG có trường nào ở dạng plaintext
  iv: Uint8Array;               // Initialization Vector (12 bytes) độc nhất của bản ghi/lần ghi này
  createdAt: number;            // Epoch timestamp lúc tạo (không đổi qua các lần update)
  updatedAt: number;            // Epoch timestamp (phục vụ LWW Conflict Resolution)
  isDeleted?: boolean;           // Cờ Tombstone Soft Delete ("Ngôi Mộ")
  deletedAt?: number;            // Epoch timestamp lúc soft-delete
}

export interface VaultMeta {
  id: string;                   // Khóa chính cố định: "VAULT_CONFIG"
  salt: Uint8Array;              // Salt PBKDF2 dùng chung của Két sắt (16 bytes)
  canaryCipherText: ArrayBuffer; // Chuỗi CANARY_STRING đã bị mã hóa
  canaryIv: Uint8Array;           // IV riêng dùng để mã hóa/giải mã Canary
}
```

> **Khác biệt quan trọng so với thiết kế ban đầu:** Bản spec gốc từng mô tả `title`/`username` là
> "plaintext metadata để phục vụ tìm kiếm nhanh (FTS)". Implementation thực tế **mã hóa toàn bộ** các
> trường này bên trong `cipherText` — đây là một quyết định bảo mật chặt hơn (Zero-Knowledge triệt để hơn:
> ngay cả tiêu đề/username cũng không lộ ra ở dạng plaintext trên đĩa), đánh đổi lại là:
>
> * Không thể index/tìm kiếm phía Dexie/IndexedDB theo `title`/`username` (query engine không thấy được).
> * Tìm kiếm (nếu có trong tương lai) phải giải mã toàn bộ danh sách trước rồi filter trong RAM — đây
>   thực chất là những gì `fetchAndDecryptVault()` đã làm sẵn (xem 3.3 bên dưới), nên chi phí này đã được
>   trả trước ở bước unlock, không phát sinh thêm.

### 3.3. Chiến lược Giải mã (Lazy vs Eager Decryption) — `useVault.fetchAndDecryptVault` / `getSecretPassword`

* **Eager (ngay khi unlock hoặc CRUD xong):** Toàn bộ record không bị tombstone được giải mã một lượt để lấy `title`, `username`, `totpSecret` (cần thiết để hiển thị danh sách + chạy đồng hồ TOTP real-time). Record lỗi giải mã (sai khóa/tampered) bị đếm vào `skippedRecordCount` và hiển thị cảnh báo trên UI thay vì chỉ log console.
* **Lazy (chỉ khi user bấm Copy/Sửa):** Trường `password` **không** nằm trong state React (`SecretItem` không giữ password sau khi list) — nó chỉ được giải mã tức thời trong `getSecretPassword(id)` khi người dùng thao tác, giảm thời gian tồn tại của plaintext nhạy cảm nhất trong RAM.

### 3.4. Khắc Phục Lỗi Kẹt Kết Nối (Connection Lock Race Condition)

Khi người dùng Khóa Két sắt (Lock) hoặc đổi tài khoản, thao tác đóng kết nối IndexedDB là tác vụ bất đồng bộ (OS I/O). Để tránh lỗi IndexedDB Lock Contention trả về mảng rỗng `[]`, `lockVault()` bắt buộc tuân thủ:

```ts
// useVault.ts — lockVault()
masterKeyRef.current = null;
await activeDb.close();   // BẮT BUỘC await giải phóng kết nối vật lý cũ
setActiveDb(null);         // Chỉ set state UI SAU KHI đã đóng xong
```

Lần `unlockVault()` tiếp theo sẽ tự tạo một `DynamicVaultDatabase` instance mới và `await dbInstance.open()` tuần tự, tránh 2 kết nối cùng tồn tại chồng chéo lên nhau.

### 3.5. Đổi Master Password / Key Rotation — `core/storage/vault-migration-engine.ts`, `useVault.changePassword`, `ChangePasswordForm.tsx`

Tính năng hoàn toàn mới so với bản 1.1, cho phép người dùng đổi Master Password mà không mất dữ liệu và
không để lộ ciphertext cũ dưới key mới (không tái sử dụng IV):

```text
1. Xác minh mật khẩu CŨ đúng: deriveVaultId(oldPassword) phải khớp vaultId hiện tại (KHÔNG chạy PBKDF2 lại
   để so sánh trực tiếp — dùng lại phép so sánh VaultId nhanh, rẻ hơn).
2. Chặn trường hợp mật khẩu MỚI trùng mật khẩu hiện tại (so sánh VaultId một lần nữa).
3. Sinh Salt 16-byte MỚI hoàn toàn ngẫu nhiên.
4. KeyDerivationWorkerClient.deriveKey(newPasswordBuffer, newSalt) trên Web Worker → newKey.
5. Mã hóa lại CANARY_STRING bằng newKey → tạo VaultMeta mới (salt, canaryCipherText, canaryIv mới).
6. VaultMigrationEngine.migrateVaultData(oldDb, oldKey, newDbName, newKey, newMeta):
   a. Với mỗi record KHÔNG bị tombstone: decryptRaw(oldKey) → encryptRaw(newKey, IV MỚI) → ghi vào DB mới.
   b. Với mỗi record ĐÃ bị tombstone (isDeleted=true): nếu deletedAt quá 30 ngày (THIRTY_DAYS_MS) →
      BỎ QUA (garbage collect vĩnh viễn); nếu chưa quá hạn → giữ nguyên tombstone, copy sang DB mới.
7. Đóng oldDb, indexedDB.deleteDatabase(oldDbName) — xoá VẬT LÝ file DB cũ khỏi ổ đĩa (không chỉ đánh dấu).
8. Hot-swap trong RAM: masterKeyRef.current = newKey, setVaultId(...), setActiveDb(newDbInstance),
   fetchAndDecryptVault(newKey, newDbInstance) để UI hiển thị dữ liệu đã migrate ngay lập tức.
```

> ⚠️ **Đây KHÔNG phải là Tombstone GC tổng quát cho toàn hệ thống** — bước lọc bỏ tombstone quá hạn ở 6b
> CHỈ chạy như một side-effect của luồng đổi Master Password (`vault-migration-engine.ts`). Luồng đồng bộ
> Google Drive thông thường (`vault-sync-engine.ts`, §4.1) vẫn KHÔNG có bất kỳ cơ chế dọn dẹp tombstone
> nào — một Vault không bao giờ đổi mật khẩu sẽ tích lũy tombstone vĩnh viễn. Xem §8 để biết trạng thái đầy
> đủ của gap này.
>
> **Vì sao xóa DB cũ ngay lập tức thay vì giữ lại làm backup?** Vì tên DB được dẫn xuất tất định từ mật
> khẩu (`ZeroKnowledgeVaultDB_<vaultId>`, §3.1) — nếu không xóa, DB cũ (khớp với `vaultId` cũ) sẽ không bao
> giờ được dọn dẹp và chiếm dụng ổ đĩa vĩnh viễn kể từ lần đổi mật khẩu đầu tiên trở đi.
>
> Được kiểm chứng bằng `core/storage/vault-migration.test.ts` (re-encryption đúng dữ liệu dưới key mới +
> tombstone quá hạn 30 ngày bị lọc bỏ, tombstone chưa quá hạn được giữ nguyên).

---

## 4. ĐẶC TẢ ENGINE ĐỒNG BỘ & GỘP DỮ LIỆU (DISTRIBUTED SYNC ENGINE) — `core/storage/vault-sync-engine.ts`

### 4.1. Giải Thuật Gộp Dữ Liệu Cấp Bản Ghi (Record-Level Last-Write-Wins)

Khi đồng bộ với Google Drive REST API v3, hệ thống tải file nhị phân `zero_knowledge_vault_sync.enc` từ vùng nhớ đặc quyền `appDataFolder` về RAM (`GoogleDriveClient.downloadBackup`) và gọi `VaultSyncEngine.mergeAndSave`:

```text
Tham số đầu vào: localRecords (từ IndexedDB), remotePayload.records (từ Google Drive JSON)
1. Validate remotePayload.vaultId === currentVaultId, nếu khác → throw
   "Dữ liệu trên đám mây thuộc về một Két sắt khác!" (chặn trộn nhầm 2 vault khác mật khẩu).
2. Chạy thuật toán Salt Adoption (xem 4.2) TRƯỚC KHI merge records.
3. Với mỗi record trong remotePayload.records:
   a. Nếu ID chưa tồn tại local → add thẳng (addedCount++).
   b. Nếu ID đã tồn tại và remote.updatedAt > local.updatedAt → ghi đè (updatedCount++).
   c. So sánh timestamp là VÔ ĐIỀU KIỆN với isDeleted — tombstone mới hơn thắng bản update cũ hơn,
      và ngược lại một update mới hơn cũng có thể "hồi sinh" một record đã bị xóa trước đó
      (đây là hành vi CHỦ Ý: cho phép user re-create/edit sau khi xóa ở thiết bị khác).
4. exportVault() sau đó luôn đẩy TOÀN BỘ record — bao gồm cả tombstone (isDeleted=true) — lên lại
   Google Drive để các thiết bị khác nhận được tín hiệu xóa.
```

> ⚠️ **Khoảng cách so với thiết kế ban đầu (Roadmap, chưa implement):** Tài liệu gốc từng đặc tả bước
> **Tombstone Garbage Collection** — hard-delete vĩnh viễn các record có `isDeleted:true` VÀ đã quá 30
> ngày (`2,592,000,000 ms`) khỏi cả Local DB lẫn payload đám mây. **Hàm này hiện KHÔNG tồn tại trong
> `vault-sync-engine.ts`** — tombstone hiện tại tồn tại vĩnh viễn, không có cơ chế dọn dẹp tự động. Payload
> đồng bộ sẽ phình to dần theo thời gian nếu người dùng xóa nhiều bản ghi. Đây là một hạng mục kỹ thuật nợ
> (tech debt) đã biết, được track ở đây thay vì bị âm thầm bỏ quên.

### 4.2. Giao Thức "Nhận Nuôi Salt" Đa Thiết Bị (Cross-Device Salt Adoption + Forced Relogin)

Đây là cơ chế **quan trọng nhất và phức tạp nhất** của toàn bộ engine đồng bộ, không có trong bản Tech Spec gốc, được bổ sung để giải quyết một race condition thực tế: khi user mở Vault trên **thiết bị hoàn toàn mới** với cùng Master Password, `unlockVault()` không tìm thấy `meta` local nên tự sinh ra một **Salt PBKDF2 ngẫu nhiên mới** (first-time-setup branch) — Salt này chắc chắn KHÁC với Salt đã dùng trên thiết bị gốc, nên Master Key dẫn xuất ra sẽ không giải mã được bất kỳ record nào tải về từ Cloud.

```text
[Thiết bị mới: unlockVault() không thấy meta] ──► Tự sinh Salt MỚI + Canary MỚI (Key sai với dữ liệu Cloud)
             │
             ▼
[User bấm Sync] ──► mergeAndSave() so sánh localMeta.salt vs remotePayload.meta.salt
             │
             ├──► Salt KHÁC NHAU và local CHƯA có record nào (thiết bị mới tinh)
             │        ──► "Nhận nuôi" (adopt): GHI ĐÈ localMeta bằng {salt, canaryCipherText, canaryIv}
             │            của remote, trả về requireRelogin: true
             │
             └──► Salt KHÁC NHAU nhưng local ĐÃ có record (dữ liệu thật, không phải rác)
                      ──► throw "Xung đột khóa: Thiết bị này đang chứa dữ liệu cũ bằng một khóa khác.
                          Vui lòng xóa dữ liệu (Clear Site Data) trước khi đồng bộ."
             │
             ▼
[useVaultSync.triggerSync nhận requireRelogin=true]
             ──► alert() thông báo user ──► gọi onRequireReLogin() (= lockVault())
             ──► DỪNG NGAY luồng Push (không upload) vì masterKeyRef đang giữ khóa SAI
             ──► User unlock lại bằng CÙNG Master Password ──► lần này đọc đúng Salt vừa "nhận nuôi"
             ──► PBKDF2 ra đúng Master Key ──► toàn bộ record vừa sync giờ giải mã được bình thường
```

**Tại sao không tự động re-derive key ngay trong `triggerSync` mà phải bắt user unlock lại?** Vì Master
Key hiện đang nằm trong `masterKeyRef` (React `useRef`, không phải state) — không thể "hot-swap" nó giữa
chừng một cách an toàn mà không đảm bảo toàn bộ UI/hooks đang tham chiếu đúng key mới. Buộc một chu trình
`lockVault → unlockVault` đầy đủ là cách đơn giản và an toàn nhất để tránh trạng thái nửa-đúng-nửa-sai.

Được kiểm chứng bằng regression test thực (không phải mô phỏng tay) sử dụng `fake-indexeddb` + toàn bộ
module gốc: `core/storage/vault-sync-repro.test.ts` — *"Cross-device sync (salt adoption + forced
relogin)"*.

### 4.3. Bảo vệ chống "Hồi Sinh Ma" (Tombstone Anti-Resurrection)

* Xóa **luôn luôn** là soft-delete: `deleteSecret()` không bao giờ gọi `db.records.delete(id)`, chỉ `put()` một tombstone (`cipherText`/`iv` rỗng, `isDeleted:true`, `deletedAt`, `updatedAt` mới).
* `exportVault()` **không được phép** lọc bỏ tombstone khỏi payload xuất đi — nếu lọc, thiết bị khác sẽ không bao giờ biết record đã bị xóa và sẽ "hồi sinh" (resurrect) nó ở lần merge kế tiếp.
* Kiểm chứng bởi `core/storage/vault-sync-tombstone.test.ts`: (1) thiết bị "cũ" (stale) merge một tombstone từ remote không được resurrect record; (2) LWW từ chối một update stale (cũ hơn) ghi đè lên bản local mới hơn. Cả hai test đều dùng chung `salt` giữa 2 "thiết bị" giả lập (nếu không sẽ dính lỗi "Xung đột khóa" không liên quan tới thứ đang test).

---

## 5. ĐẶC TẢ TÍCH HỢP GOOGLE DRIVE (BYOC CLOUD SYNC) — `core/storage/google-drive-client.ts`

* **Vùng lưu trữ:** `drive.appdata` scope — file `zero_knowledge_vault_sync.enc` được lưu trong `appDataFolder`, một vùng ẩn của Drive mà chính người dùng (qua UI Google Drive bình thường) và các app khác **không** nhìn thấy được, chỉ app đã xin đúng scope này mới truy cập.
* **Xác thực:** Google Identity Services (GIS) `initTokenClient` + `requestAccessToken`, KHÔNG dùng thư viện `gapi` cũ.
* **Silent vs Interactive Auth (điểm dễ gây lỗi nhất):** `authenticate({ interactive })`:
  * `interactive: true` (user bấm nút Sync trực tiếp) → cho phép gọi `requestAccessToken({ prompt: "" })` (silent, tận dụng session cookie) hoặc `{ prompt: "consent" }` nếu `forcePrompt`.
  * `interactive: false` (auto-sync ngầm sau khi `addSecret`/`updateSecret`/`deleteSecret`) → nếu **chưa có** access token sẵn trong RAM, **KHÔNG ĐƯỢC** mở popup — nhiều trình duyệt (đặc biệt Safari) chặn popup không phát sinh trực tiếp từ user gesture. Thay vào đó reject ngay với lỗi gắn `code: "AUTH_REQUIRED"` để nơi gọi bỏ qua đồng bộ ngầm một cách êm ái, không hiện lỗi giật mình cho người dùng.
  * Access token được cache trong instance field (`this.accessToken`), tái sử dụng cho các lần gọi sau trong cùng phiên, và có thể bị `invalidateToken()` để buộc xin lại khi hết hạn.
* **Typed error codes** trả về qua `Error & { code: string }` để UI phân biệt xử lý: `AUTH_REQUIRED`, `POPUP_BLOCKED` (trình duyệt chặn popup), `POPUP_CLOSED` (user đóng popup giữa chừng), `AUTH_ERROR` (fallback).
* **Khởi động SDK:** `useVaultSync` chủ động gọi `driveClient.initClient()` ngay khi mount và tự retry mỗi 300ms nếu SDK Google (`<script async defer>` trong `index.html`) chưa tải xong, tránh race condition "gọi API trước khi SDK sẵn sàng".

---

## 6. CẤU HÌNH BẢO MẬT ĐÁM MÂY & TRIỂN KHAI (CLOUD DEPLOYMENT & CSP)

Ứng dụng có **hai lớp CSP độc lập, cần được rà soát đồng bộ** khi thay đổi:

1. **`<meta http-equiv="Content-Security-Policy">` trong `index.html`** — áp dụng ở MỌI môi trường (kể cả `npm run dev` local), vì đây là tag tĩnh trong HTML, không phụ thuộc hosting.
2. **HTTP Response Headers trong `vercel.json`** — chỉ áp dụng khi deploy thật trên Vercel Edge Network; đây là lớp phòng thủ mạnh hơn vì header HTTP không thể bị một script injected chỉnh sửa (khác với meta tag, về lý thuyết có thể bị ghi đè bởi 1 tag CSP khác chèn sau nếu có lỗ hổng injection khác).

Cấu hình hiện tại của `vercel.json` (đầy đủ, khớp với repo):

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self' 'unsafe-inline' https://accounts.google.com; connect-src 'self' https://www.googleapis.com https://accounts.google.com; frame-src 'self' https://accounts.google.com; style-src 'self' 'unsafe-inline' https://accounts.google.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https://www.gstatic.com; object-src 'none'; base-uri 'self'; form-action 'self';" },
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin-allow-popups" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(self), microphone=(), geolocation=()" }
      ]
    }
  ],
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

> **Việc cần làm (đã ghi nhận, chưa fix):** `vercel.json` có thêm `object-src 'none'`, `base-uri 'self'`,
> `form-action 'self'` mà `index.html`'s meta tag **không có**. Vì local dev chỉ được bảo vệ bởi meta tag,
> nên hiện tại môi trường dev đang **thiếu 3 directive an toàn** này so với production. Nên đồng bộ 2 file
> để dev/prod có cùng mức phòng thủ.

**Note về COOP Warning:** Thông báo `Cross-Origin-Opener-Policy policy would block the window.closed
call` trong Console khi mở Pop-up Google là cảnh báo lành tính (Benign Warning) do W3C Memory Isolation.
Tuyệt đối KHÔNG hạ cấp xuống `unsafe-none` để giữ vững tường lửa cô lập bộ nhớ RAM.

---

## 7. KIỂM THỬ & CHẤT LƯỢNG (TESTING & QA)

* **Test runner:** Vitest 4 (`npx vitest run`). IndexedDB được polyfill bằng `fake-indexeddb/auto` — cho
  phép chạy test tích hợp (integration test) dùng **module thật** (không mock crypto/Dexie), vì Node có
  sẵn `crypto.subtle` native.
* **Bộ test hiện có:**

  | File | Phạm vi |
  | --- | --- |
  | `core/crypto/crypto.test.ts` | AES-GCM roundtrip, PBKDF2 key derivation, TOTP RFC 6238 vector |
  | `core/storage/vault-sync-repro.test.ts` | Cross-device sync: salt adoption + forced relogin (§4.2) |
  | `core/storage/vault-sync-tombstone.test.ts` | Tombstone anti-resurrection + LWW stale-update rejection (§4.3) |
  | `core/storage/vault-migration.test.ts` | Key rotation (đổi Master Password): re-encryption đúng key mới + tombstone quá hạn 30 ngày bị GC, tombstone chưa quá hạn được giữ (§3.5) |

* **Type-check:** `npx tsc -b` (dùng project references `tsconfig.app.json` + `tsconfig.node.json`).
* **Lint:** `npm run lint` — ESLint 10 flat config + `typescript-eslint` + `eslint-plugin-react-hooks` +
  `eslint-plugin-react-refresh`, chạy với `--max-warnings 0` (không cho phép warning lọt qua CI).
* **Format:** Prettier 3 + `prettier-plugin-tailwindcss` (sắp xếp lại thứ tự class name theo quy ước
  Tailwind) chạy trên nền Tailwind CSS v4 thật (`@tailwindcss/vite`, xem §8 — pipeline này trước đây
  bị flag là gap, nay đã được wire đầy đủ vào `vite.config.ts`).

---

## 8. HẠN CHẾ & LỘ TRÌNH KỸ THUẬT ĐÃ BIẾT (KNOWN GAPS & ROADMAP)

Phần này liệt kê trung thực các khoảng cách giữa tài liệu/tầm nhìn sản phẩm và trạng thái implementation
hiện tại, để bất kỳ ai tiếp nhận codebase không hiểu nhầm đây là tính năng đã hoàn thiện.

| Hạng mục | Trạng thái | Ghi chú |
| --- | --- | --- |
| Tombstone Garbage Collection (30 ngày) | ⚠️ Triển khai một phần | Chỉ chạy như side-effect của luồng đổi Master Password (`vault-migration-engine.ts`, §3.5). Luồng đồng bộ Google Drive thông thường (§4.1) vẫn không dọn tombstone — vault không bao giờ đổi mật khẩu sẽ tích lũy tombstone vĩnh viễn |
| PWA (Manifest + Service Worker, offline install) | ❌ Chưa implement | Không có `manifest.json`, không `vite-plugin-pwa`, `public/` chỉ có icon tĩnh |
| Passkeys / WebAuthn unlock | ✅ Mở khóa sinh trắc học đã có (không phải passkey thuần) | WebAuthn PRF wrap/unwrap Master Key (§2.6) đã triển khai như một lớp unlock tiện lợi, KHÔNG thay thế hoàn toàn Master Password (vẫn cần mật khẩu để tạo két sắt lần đầu / fallback) |
| Argon2id key derivation | ❌ Chưa implement | Chỉ PBKDF2-SHA256 600k rounds tồn tại trong code (nay chạy trong Web Worker, xem §2.1) |
| Tailwind CSS build pipeline | ✅ Đã có | `tailwindcss` v4 + `@tailwindcss/vite` đã có trong `devDependencies` và được wire vào `vite.config.ts` (CSS-first config qua `@import "tailwindcss"` trong `index.css`, không cần `tailwind.config.js`). Gap này đã được đóng. |
| CSP đồng bộ dev/prod | ⚠️ Lệch nhẹ | `index.html` (dev) thiếu `object-src`/`base-uri`/`form-action` so với `vercel.json` (prod) — xem §6 |
| Server-side / rate-limited brute-force protection | ⚠️ Giới hạn theo thiết kế | Chỉ có client-side `localStorage` throttling (§2.5) — chấp nhận được vì kiến trúc Zero-Knowledge không có server, nhưng cần ghi rõ trong tài liệu bảo mật gửi người dùng cuối |

Các mục ❌ nên được đưa vào backlog rõ ràng (issue tracker) thay vì nằm im trong tài liệu; các mục ⚠️ nên
được xử lý trước khi công bố sản phẩm là "production-ready" cho người dùng thật.
