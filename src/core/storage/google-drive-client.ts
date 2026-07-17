/* eslint-disable @typescript-eslint/no-explicit-any */
// src/core/storage/google-drive-client.ts

const SYNC_FILE_NAME = "zero_knowledge_vault_sync.enc";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";

export interface SyncPayload {
  version: number;
  vaultId: string;
  syncedAt: number;
  meta: {
    salt: number[];
    canaryCipherText: number[];
    canaryIv: number[];
  };
  records: Array<{
    id: string;
    cipherText: number[];
    iv: number[];
    createdAt: number;
    updatedAt: number;
  }>;
}

export class GoogleDriveClient {
  private accessToken: string | null = null;
  private tokenClient: any = null;
  private clientId: string;

  constructor(clientId: string) {
    this.clientId = clientId;
  }

  /**
   * Khởi tạo Google Identity Services (GIS) Token Client
   */
  public initClient(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ensureTokenClient();
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  /** Khởi tạo tokenClient ĐỒNG BỘ (idempotent). Ném lỗi nếu SDK chưa sẵn sàng. */
  private ensureTokenClient(): void {
    if (this.tokenClient) return;
    if (!window.google?.accounts?.oauth2) {
      throw new Error("Google Identity Services SDK chưa tải xong. Đợi vài giây rồi thử lại.");
    }
    this.tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: this.clientId,
      scope: DRIVE_SCOPE,
      callback: () => {}, // gán lại trong authenticate()
    });
  }

  /**
   * Yêu cầu cấp quyền (OAuth2 Flow)
   * ĐIỂM CHẠM SENIOR: Cải tiến cơ chế Silent Token Acquisition (Lấy token ngầm)
   * Chỉ bắt người dùng tương tác popup ở lần đầu tiên. Những lần sau sẽ tự động chạy ngầm.
   *
   * @param options.forcePrompt Buộc hiện popup "consent" (xin lại quyền) thay vì popup mặc định.
   * @param options.interactive Đánh dấu lệnh gọi này có xuất phát TRỰC TIẾP từ thao tác click
   *   của người dùng hay không. Khi `false` (vd: auto-sync ngầm sau khi thêm secret) và chưa có
   *   access token trong RAM, ta KHÔNG được gọi `requestAccessToken` vì trình duyệt (đặc biệt
   *   Safari) sẽ chặn popup do không nhận diện được đây là hành động của user, và Google Identity
   *   Services sẽ log lỗi "Failed to open popup window... Maybe blocked by the browser?". Thay vào
   *   đó ta reject sớm với lỗi `AUTH_REQUIRED` để nơi gọi có thể bỏ qua đồng bộ ngầm một cách êm ái.
   */
  public authenticate(
    options: { forcePrompt?: boolean; interactive?: boolean } = {},
  ): Promise<string> {
    const { forcePrompt = false, interactive = true } = options;

    return new Promise((resolve, reject) => {
      // Khởi tạo tokenClient ĐỒNG BỘ ngay tại đây (nếu chưa có) để requestAccessToken() được gọi
      // trong cùng tác vụ (task) của cú click => giữ "user gesture", trình duyệt không chặn popup.
      try {
        this.ensureTokenClient();
      } catch (err) {
        reject(err);
        return;
      }

      // 1. Tối ưu hóa: Nếu token đã có sẵn trong RAM, tái sử dụng ngay lập tức
      if (this.accessToken) {
        resolve(this.accessToken);
        return;
      }

      // 1b. Nếu đây KHÔNG phải luồng tương tác trực tiếp (click) và chưa có token,
      // không được mở popup — dừng ngay để tránh bị trình duyệt chặn & log lỗi.
      if (!interactive) {
        const err = new Error(
          "Cần đăng nhập lại Google Drive (yêu cầu thao tác trực tiếp của người dùng).",
        ) as Error & { code: string };
        err.code = "AUTH_REQUIRED";
        reject(err);
        return;
      }

      this.tokenClient.callback = (resp: any) => {
        if (resp.error) {
          reject(new Error(resp.error_description || resp.error));
          return;
        }
        this.accessToken = resp.access_token;
        resolve(this.accessToken!);
      };

      this.tokenClient.error_callback = (err: { type?: string; message?: string }) => {
        let message: string;
        let code = "AUTH_ERROR";

        if (err?.type === "popup_failed_to_open") {
          message =
            "Trình duyệt đã chặn popup đăng nhập Google. Vui lòng cho phép popup cho trang này rồi bấm Sync lại.";
          code = "POPUP_BLOCKED";
        } else if (err?.type === "popup_closed") {
          message = "Bạn đã đóng cửa sổ đăng nhập Google trước khi hoàn tất. Vui lòng thử lại.";
          code = "POPUP_CLOSED";
        } else {
          message = err?.message || "Không thể mở cửa sổ đăng nhập Google Drive.";
        }

        const e = new Error(message) as Error & { code: string };
        e.code = code;
        reject(e);
      };

      // 2. Điều khiển hành vi hiển thị popup dựa trên cờ forcePrompt
      if (forcePrompt) {
        // Buộc hiện popup hỏi lại quyền
        this.tokenClient.requestAccessToken({ prompt: "consent" });
      } else {
        // Tận dụng session cookie để lấy token hoàn toàn im lặng (Silent)
        this.tokenClient.requestAccessToken({ prompt: "" });
      }
    });
  }

  /**
   * Kiểm tra xem đã có access token còn hiệu lực trong RAM hay chưa (không tự động xin quyền mới).
   */
  public hasValidToken(): boolean {
    return this.accessToken !== null;
  }

  /**
   * Đánh dấu token hết hạn (Token Expiration Handling) để buộc xin lại token mới ở lần gọi sau
   */
  public invalidateToken(): void {
    this.accessToken = null;
  }

  /**
   * Tìm kiếm ID của file đồng bộ trong vùng nhớ ẩn appDataFolder
   */
  private async getSyncFileId(): Promise<string | null> {
    if (!this.accessToken) throw new Error("Chưa xác thực Google Drive.");

    const query = encodeURIComponent(
      `name='${SYNC_FILE_NAME}' and 'appDataFolder' in parents and trashed=false`,
    );
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${query}&spaces=appDataFolder&fields=files(id,name,modifiedTime)`,
      {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      },
    );

    const data = await response.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
    return null;
  }

  /**
   * Tải payload đồng bộ từ Google Drive về máy
   */
  public async downloadBackup(): Promise<SyncPayload | null> {
    const fileId = await this.getSyncFileId();
    if (!fileId) return null;

    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!response.ok) throw new Error("Tải dữ liệu từ Google Drive thất bại.");
    return await response.json();
  }

  /**
   * Đẩy payload mã hóa lên Google Drive (Tạo mới hoặc Ghi đè file cũ)
   */
  public async uploadBackup(payload: SyncPayload): Promise<void> {
    if (!this.accessToken) throw new Error("Chưa xác thực Google Drive.");

    const fileId = await this.getSyncFileId();
    const metadata = {
      name: SYNC_FILE_NAME,
      parents: ["appDataFolder"],
    };

    const form = new FormData();
    form.append(
      "metadata",
      new Blob([JSON.stringify(fileId ? {} : metadata)], { type: "application/json" }),
    );
    form.append("file", new Blob([JSON.stringify(payload)], { type: "application/json" }));

    const url = fileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
      : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;

    const method = fileId ? "PATCH" : "POST";

    const response = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${this.accessToken}` },
      body: form,
    });

    if (!response.ok) throw new Error("Đồng bộ lên Google Drive thất bại.");
  }
}
