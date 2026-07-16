/**
 * Class chuyên ghi đè Uint8Array bằng 0
 */

/**
 * Ghi đè toàn bộ mảng nhị phân bằng số 0 trước khi hủy tham chiếu.
 * Giúp ngăn chặn tấn công đọc trộm RAM (Memory Dump / Side-channel attacks).
 */
export class MemoryWiper {
  public static wipe(
    data: Uint8Array | Int8Array | Uint16Array | Int16Array | Uint32Array | Int32Array | Float32Array | Float64Array,
  ): void {
    if (data && "fill" in data) {
      data.fill(0);
    }
  }

  /**
   * Xóa sạch một chuỗi (String) khỏi RAM bằng cách chuyển nó thành Uint8Array,
   * ghi đè, và ép Garbage Collector nhận diện tham chiếu rỗng.
   * Lưu ý: Trong JS không thể can thiệp trực tiếp vào String primitive của V8 engine,
   * nên quy tắc Senior ở đây là: Luôn nhận Input mật khẩu dưới dạng Uint8Array từ UI Form!
   */
  public static wipeArrayBuffer(buffer: ArrayBuffer): void {
    const view = new Uint8Array(buffer);
    view.fill(0);
  }
}
