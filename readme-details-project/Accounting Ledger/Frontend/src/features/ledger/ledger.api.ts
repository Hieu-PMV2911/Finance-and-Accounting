import { api } from '@/lib/api'
import { scopeParams } from '@/lib/scope'
import type {
  GeneralLedger,
  Reconciliation,
  ReportScope,
  TrialBalance,
} from '@/types/api'

export interface GeneralLedgerQuery extends ReportScope {
  accountId: string
  limit?: number
  offset?: number
}

/** Sổ cái chi tiết của một tài khoản: dư đầu kỳ → phát sinh (kèm số dư lũy kế) → dư cuối kỳ. */
export async function fetchGeneralLedger(
  query: GeneralLedgerQuery,
): Promise<GeneralLedger> {
  const { accountId, limit, offset, ...scope } = query
  const params: Record<string, string> = {
    accountId,
    ...scopeParams(scope),
  }
  if (limit !== undefined) params.limit = String(limit)
  if (offset !== undefined) params.offset = String(offset)

  const { data } = await api.get<GeneralLedger>('/ledger/general-ledger', {
    params,
  })
  return data
}

/** Bảng cân đối số phát sinh: mọi tài khoản + tổng + cờ `balanced`. */
export async function fetchTrialBalance(
  scope: ReportScope,
): Promise<TrialBalance> {
  const { data } = await api.get<TrialBalance>('/ledger/trial-balance', {
    params: scopeParams(scope),
  })
  return data
}

/**
 * Đối chiếu số dư đã lưu với số dư tái lập từ bút toán của một kỳ.
 * Chỉ nhận `periodId` (không dùng khoảng ngày).
 */
export async function fetchReconciliation(
  periodId: string,
): Promise<Reconciliation> {
  const { data } = await api.get<Reconciliation>('/ledger/reconciliation', {
    params: { periodId },
  })
  return data
}
