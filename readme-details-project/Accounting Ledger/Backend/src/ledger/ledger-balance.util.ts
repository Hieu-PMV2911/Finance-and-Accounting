import type { Decimal } from 'decimal.js';

import { moneyToString, toMoney } from '../common/utils/money.util.js';

/**
 * Số học số dư dùng chung cho mọi read-model của sổ cái.
 *
 * Đây là chỗ hiện thực hóa **bất biến số 9**: số dư là **số dư thuần**
 * `(Nợ đầu − Có đầu) + (Nợ phát sinh − Có phát sinh)`, KHÔNG phải tổng riêng
 * từng cột. Tài khoản vừa phát sinh Nợ vừa phát sinh Có (ví dụ ghi nhận doanh
 * thu rồi đảo bút toán) phải triệt tiêu nhau.
 */

/** Bốn cột tiền của một dòng số dư. */
export interface BalanceColumns {
  openingDebit: string;
  openingCredit: string;
  debitTotal: string;
  creditTotal: string;
}

/** Số dư thuần: dương = dư Nợ, âm = dư Có. */
export function netBalanceOf(row: BalanceColumns): Decimal {
  return toMoney(row.openingDebit)
    .minus(toMoney(row.openingCredit))
    .plus(toMoney(row.debitTotal))
    .minus(toMoney(row.creditTotal));
}

/** Tách số dư thuần thành cặp (dư Nợ, dư Có) để trình bày — một trong hai bằng 0. */
export function splitNet(net: Decimal): { debit: string; credit: string } {
  return net.isNegative()
    ? { debit: moneyToString(0), credit: moneyToString(net.negated()) }
    : { debit: moneyToString(net), credit: moneyToString(0) };
}
