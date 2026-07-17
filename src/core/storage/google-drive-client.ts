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
      if (!window.google?.accounts?.oauth2) {
        reject(new Error("Google Identity Services SDK chưa được tải vào trình duyệt."));
        return;
      }

      this.tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: this.clientId,
        scope: DRIVE_SCOPE,
        callback: (response: any) => {
          if (response.error !== undefined) {
            reject(response);
            return;
          }
          this.accessToken = response.access_token;
          resolve();
        },
      });
      resolve();
    });
  }

  /**
   * Yêu cầu cấp quyền (OAuth2 Flow)
   * ĐIỂM CHẠM SENIOR: Cải tiến cơ chế Silent Token Acquisition (Lấy token ngầm)
   * Chỉ bắt người dùng tương tác popup ở lần đầu tiên. Những lần sau sẽ tự động chạy ngầm.
   */
  public authenticate(forcePrompt = false): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.tokenClient) {
        reject(new Error("Token Client chưa khởi tạo"));
        return;
      }

      // 1. Tối ưu hóa: Nếu token đã có sẵn trong RAM, tái sử dụng ngay lập tức
      if (this.accessToken) {
        resolve(this.accessToken);
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
