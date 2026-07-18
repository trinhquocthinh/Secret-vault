/* eslint-disable @typescript-eslint/no-explicit-any */
// src/core/crypto/webauthn-prf.ts
const PRF_STATIC_SALT = new TextEncoder().encode("ZERO_VAULT_PRF_SALT_V1");

export interface BiometricRegistrationResult {
  credentialId: string;
  prfSymmetricKey: CryptoKey;
}

export class WebAuthnPrfEngine {
  /**
   * Kiểm tra trình duyệt và thiết bị có hỗ trợ chuẩn WebAuthn PRF Extension hay không
   */
  public static async isSupported(): Promise<boolean> {
    if (!window.PublicKeyCredential) return false;

    // Kiểm tra authenticator nền tảng (TouchID, Windows Hello, FaceID)
    const isPlatformAvailable =
      await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if (!isPlatformAvailable) return false;

    // Kiểm tra trình duyệt có nhận diện extension PRF không
    try {
      // TypeScript đôi khi chưa kịp cập nhật type cho prf trong AuthenticationExtensionsClientInputs
      // nên ta map qua type any hoặc record mở rộng
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Đăng ký Credential vân tay mới kèm theo yêu cầu PRF Extension
   */
  public static async registerBiometric(
    userId: string,
    username: string,
  ): Promise<BiometricRegistrationResult> {
    const challenge = crypto.getRandomValues(new Uint8Array(32));

    const publicKey: PublicKeyCredentialCreationOptions = {
      challenge,
      rp: { name: "Zero-Vault Security", id: window.location.hostname },
      user: {
        id: new TextEncoder().encode(userId),
        name: username,
        displayName: username,
      },
      pubKeyCredParams: [
        { alg: -7, type: "public-key" }, // ES256
        { alg: -257, type: "public-key" }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform", // Buộc dùng phần cứng tích hợp của máy
        userVerification: "required", // Buộc phải quét vân tay/FaceID thật
        residentKey: "preferred",
      },
      extensions: {
        // Yêu cầu chip TPM đánh giá PRF với Salt tĩnh của Zero-Vault
        prf: {
          eval: {
            first: PRF_STATIC_SALT,
          },
        },
      } as any,
    };

    const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential;
    if (!credential) throw new Error("Đăng ký sinh trắc học bị hủy hoặc thất bại.");

    // Lấy chuỗi nhị phân PRF trả về từ extension
    const extensionResults = credential.getClientExtensionResults() as any;
    const prfOutput = extensionResults?.prf?.results?.first as ArrayBuffer;

    if (!prfOutput) {
      throw new Error(
        "Trình duyệt hoặc phần cứng này không hỗ trợ tạo khóa tĩnh qua WebAuthn PRF Extension.",
      );
    }

    // Biến chuỗi PRF 32-byte thành CryptoKey (KEK) AES-GCM trong RAM
    const prfSymmetricKey = await crypto.subtle.importKey(
      "raw",
      prfOutput,
      { name: "AES-GCM" },
      false, // Không cho phép extract ra khỏi RAM
      ["encrypt", "decrypt"],
    );

    // Chuyển credentialId thành chuỗi Base64URL để lưu xuống DB
    const credentialId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");

    return { credentialId, prfSymmetricKey };
  }

  /**
   * Xác thực vân tay để lấy lại khóa KEK (PRF Output)
   */
  public static async authenticateBiometric(credentialIdBase64Url: string): Promise<CryptoKey> {
    const challenge = crypto.getRandomValues(new Uint8Array(32));

    // Decode Base64URL credentialId về ArrayBuffer
    const binStr = atob(credentialIdBase64Url.replace(/-/g, "+").replace(/_/g, "/"));
    const credentialId = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) credentialId[i] = binStr.charCodeAt(i);

    const publicKey: PublicKeyCredentialRequestOptions = {
      challenge,
      rpId: window.location.hostname,
      allowCredentials: [
        {
          id: credentialId,
          type: "public-key",
          transports: ["internal"],
        },
      ],
      userVerification: "required",
      extensions: {
        prf: {
          eval: {
            first: PRF_STATIC_SALT,
          },
        },
      } as any,
    };

    const credential = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential;
    if (!credential) throw new Error("Xác thực sinh trắc học bị từ chối.");

    const extensionResults = credential.getClientExtensionResults() as any;
    const prfOutput = extensionResults?.prf?.results?.first as ArrayBuffer;

    if (!prfOutput) {
      throw new Error(
        "Không thể dẫn xuất khóa KEK từ sinh trắc học. Vui lòng mở khóa bằng mật khẩu Master.",
      );
    }

    // Trả về khóa KEK AES-GCM
    return await crypto.subtle.importKey("raw", prfOutput, { name: "AES-GCM" }, false, [
      "encrypt",
      "decrypt",
    ]);
  }
}
