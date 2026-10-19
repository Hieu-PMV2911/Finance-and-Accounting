import { Injectable } from '@nestjs/common';

import type {
  NormalizedBankTransaction,
  StatementSourceAdapter,
} from '../interfaces/statement-source-adapter.interface.js';

/**
 * **Adapter đọc sao kê từ API ngân hàng — khung rỗng có chủ đích** (mục 10.B
 * — P2.2).
 *
 * Chưa nối được nhà cung cấp nào nên `parse` **từ chối thẳng** thay vì giả vờ
 * trả dữ liệu. Cấu trúc này cố tình:
 *
 * - Cùng interface `StatementSourceAdapter` ⇒ khi có API thật, chỉ cần hiện
 *   thực `fetch`/`parse` bên trong; **không** đụng tới pipeline chung
 *   (normalize → chống trùng → khớp → đối soát) và không đụng logic khớp.
 * - Sẵn sàng cho module tương lai chọn adapter theo cấu hình thay vì theo
 *   `if source == 'file'` rải rác trong service.
 *
 * Nguồn đã hoạt động duy nhất hiện nay là `CsvJsonStatementAdapter` (file).
 */
@Injectable()
export class BankApiStatementAdapter implements StatementSourceAdapter {
  readonly name = 'bank-api';

  parse(): NormalizedBankTransaction[] {
    throw new Error(
      'Adapter API ngân hàng chưa được cấu hình — hãy dùng nguồn file (CSV/JSON) hoặc nối nhà cung cấp thật trước',
    );
  }
}
