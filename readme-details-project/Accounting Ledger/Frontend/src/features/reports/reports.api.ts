import axios from 'axios'

import { api, apiErrorMessage } from '@/lib/api'
import { scopeFileSuffix, scopeParams } from '@/lib/scope'
import type {
  BalanceSheetReport,
  CashFlowReport,
  ProfitAndLossReport,
  ReportFormat,
  ReportKind,
  ReportScope,
} from '@/types/api'

/** Báo cáo kết quả kinh doanh. */
export async function fetchProfitAndLoss(
  scope: ReportScope,
): Promise<ProfitAndLossReport> {
  const { data } = await api.get<ProfitAndLossReport>(
    '/reports/profit-and-loss',
    { params: scopeParams(scope) },
  )
  return data
}

/** Bảng cân đối kế toán (`toDate` là ngày lập báo cáo). */
export async function fetchBalanceSheet(
  scope: ReportScope,
): Promise<BalanceSheetReport> {
  const { data } = await api.get<BalanceSheetReport>('/reports/balance-sheet', {
    params: scopeParams(scope),
  })
  return data
}

/** Báo cáo lưu chuyển tiền tệ (phương pháp trực tiếp). */
export async function fetchCashFlow(
  scope: ReportScope,
): Promise<CashFlowReport> {
  const { data } = await api.get<CashFlowReport>('/reports/cash-flow', {
    params: scopeParams(scope),
  })
  return data
}

/** Tên file gốc (không dấu) theo loại báo cáo — tránh lỗi encoding khi tải xuống. */
const FILE_BASE: Record<ReportKind, string> = {
  'profit-and-loss': 'ket-qua-kinh-doanh',
  'balance-sheet': 'bang-can-doi-ke-toan',
  'cash-flow': 'luu-chuyen-tien-te',
}

/**
 * Xuất báo cáo ra Excel/PDF.
 *
 * Endpoint yêu cầu Bearer token nên **không** dùng được `<a href>` trực tiếp —
 * phải tải qua axios dưới dạng `blob` rồi kích hoạt tải xuống từ object URL.
 * Trả về tên file đã lưu để hiển thị thông báo.
 */
export async function downloadReport(
  kind: ReportKind,
  format: ReportFormat,
  scope: ReportScope,
): Promise<string> {
  const filename = `${FILE_BASE[kind]}-${scopeFileSuffix(scope)}.${format}`

  try {
    const { data } = await api.get<Blob>(`/reports/export/${kind}`, {
      params: { ...scopeParams(scope), format },
      responseType: 'blob',
    })
    triggerDownload(data, filename)
    return filename
  } catch (error) {
    throw new Error(await resolveBlobError(error))
  }
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/**
 * Với `responseType: 'blob'`, body lỗi của server cũng là `Blob` nên
 * `apiErrorMessage` không đọc được `message`. Đọc lại thành text rồi parse JSON.
 */
async function resolveBlobError(error: unknown): Promise<string> {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data
    if (data instanceof Blob) {
      try {
        const body = JSON.parse(await data.text()) as {
          message?: string | string[]
        }
        if (body.message) {
          return Array.isArray(body.message)
            ? body.message.join(', ')
            : body.message
        }
      } catch {
        // Body không phải JSON — rơi xuống thông báo chung.
      }
    }
  }
  return apiErrorMessage(error, 'Xuất báo cáo thất bại')
}
