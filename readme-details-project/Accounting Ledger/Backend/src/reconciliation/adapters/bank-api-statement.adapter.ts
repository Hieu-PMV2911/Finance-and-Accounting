import { NotImplementedException } from '@nestjs/common';

import { BankTransactionSource } from '../../common/enums/bank-transaction.enum.js';
import type {
  NormalizedBankTransaction,
  StatementParseInput,
  StatementSourceAdapter,
} from '../interfaces/statement-source-adapter.interface.js';

/**
 * Adapter lấy sao kê qua **API ngân hàng** (mục 10.B) — **khung rỗng có chủ đích**.
 *
 * Quyết định #4 đã chốt: *"CSV/JSON và kết nối ngân hàng đều đưa dữ liệu vào cùng
 * một pipeline xử lý"*. Nghĩa là khi tích hợp API ngân hàng thật, **không** được
 * viết thêm nhánh khớp đối soát thứ hai — chỉ cần hiện thực `parse()` ở đây trả về
 * đúng `NormalizedBankTransaction[]`, phần còn lại tự chạy.
 *
 * Vì sao để trống thay vì xoá: đây là **điểm mở rộng đã định nghĩa**. Có lớp này
 * thì (a) kiểu dữ liệu chuẩn đã bị ràng buộc bởi compiler, (b) `supports()` trả
 * `false` nên adapter không bao giờ được chọn nhầm, (c) người sau biết chính xác
 * phải viết gì — không phải tự nghĩ ra một kiến trúc khác.
 *
 * ⚠️ Cần khảo sát nhà cung cấp/kết nối ngân hàng trước khi hiện thực.
 */
export class BankApiStatementAdapter implements StatementSourceAdapter {
  readonly source = BankTransactionSource.API;
  readonly name = 'bank-api';

  supports(): boolean {
    // Không nhận nội dung dạng file — nguồn này lấy dữ liệu qua kết nối, không qua `content`.
    return false;
  }

  parse(_input: StatementParseInput): NormalizedBankTransaction[] {
    throw new NotImplementedException(
      'Chưa hiện thực kết nối API ngân hàng. Hiện chỉ hỗ trợ nhập sao kê từ file CSV/JSON; ' +
        'khi tích hợp API, hãy hiện thực parse() trả về NormalizedBankTransaction[] — pipeline đối soát giữ nguyên.',
    );
  }
}
