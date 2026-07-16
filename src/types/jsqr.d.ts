declare module "jsqr" {
  export interface QRCode {
    binaryData: number[];
    data: string;
    chunks: Array<{
      type: number;
      text: string;
    }>;
    location: {
      topRightCorner: { x: number; y: number };
      topLeftCorner: { x: number; y: number };
      bottomRightCorner: { x: number; y: number };
      bottomLeftCorner: { x: number; y: number };
    };
  }

  export interface Options {
    inversionAttempts?: "dontInvert" | "onlyInvert" | "attemptBoth" | "invertFirst";
  }

  /**
   * Đọc và giải mã QR Code từ mảng dữ liệu điểm ảnh (Pixel Data - RGBA).
   */
  function jsQR(
    data: Uint8ClampedArray | Uint8Array | number[],
    width: number,
    height: number,
    options?: Options,
  ): QRCode | null;

  export default jsQR;
}
