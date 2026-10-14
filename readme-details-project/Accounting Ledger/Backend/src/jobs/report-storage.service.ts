import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { BadRequestException, Injectable, Logger } from '@nestjs/common';

/** Chỉ chấp nhận tên file là UUID — chặn mọi mưu toan thoát khỏi thư mục lưu. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Đuôi file an toàn: chỉ chữ và số, tối đa 8 ký tự. */
const EXTENSION_PATTERN = /^[a-z0-9]{1,8}$/i;

/**
 * Kho file báo cáo sinh ở chế độ nền (mục 9).
 *
 * Job `generate-report` không thể trả file qua Redis một cách hợp lý, nên file
 * được ghi xuống đĩa tại `<REPORT_STORAGE_DIR>/<jobRunId>.<ext>`; API tải xuống
 * đọc lại từ đó. Tên file trên đường dẫn luôn là **id lượt chạy job**, không
 * phải tên do client gửi lên — nhờ vậy không có đường nào để ghi/đọc ra ngoài
 * thư mục này.
 *
 * Mặc định `storage/reports` trong thư mục chạy; đổi bằng `REPORT_STORAGE_DIR`.
 */
@Injectable()
export class ReportStorageService {
  private readonly logger = new Logger(ReportStorageService.name);
  private readonly directory: string;

  constructor() {
    this.directory = resolve(
      process.env.REPORT_STORAGE_DIR ?? join(process.cwd(), 'storage', 'reports'),
    );
  }

  get path(): string {
    return this.directory;
  }

  /** Ghi file báo cáo, trả về tên file đã dùng (`<jobRunId>.<ext>`). */
  async save(jobRunId: string, filename: string, buffer: Buffer): Promise<string> {
    const extension = extensionOf(filename);
    const stored = `${safeId(jobRunId)}.${extension}`;
    await mkdir(this.directory, { recursive: true });
    await writeFile(join(this.directory, stored), buffer);
    this.logger.log(`Đã lưu báo cáo ${stored} (${buffer.length} bytes)`);
    return stored;
  }

  /** Đọc lại file đã sinh; `null` nếu không còn (chưa sinh hoặc đã dọn). */
  async read(jobRunId: string, extension: string): Promise<Buffer | null> {
    if (!EXTENSION_PATTERN.test(extension)) return null;
    try {
      return await readFile(join(this.directory, `${safeId(jobRunId)}.${extension}`));
    } catch {
      return null;
    }
  }

  /** Xóa file đã sinh (dùng khi dọn dẹp định kỳ). */
  async remove(jobRunId: string, extension: string): Promise<void> {
    if (!EXTENSION_PATTERN.test(extension)) return;
    await rm(join(this.directory, `${safeId(jobRunId)}.${extension}`), {
      force: true,
    });
  }
}

function safeId(jobRunId: string): string {
  if (!UUID_PATTERN.test(jobRunId)) {
    throw new BadRequestException('jobRunId không hợp lệ');
  }
  return jobRunId;
}

function extensionOf(filename: string): string {
  const match = /\.([a-z0-9]{1,8})$/i.exec(filename);
  return match?.[1]?.toLowerCase() ?? 'bin';
}
