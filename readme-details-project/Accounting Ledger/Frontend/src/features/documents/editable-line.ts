/** Một dòng đang nhập trên form — tiền giữ dạng chuỗi như payload API. */
export interface EditableLine {
  description: string
  quantity: string
  unitPrice: string
}

/** Dòng trống để bắt đầu một chứng từ mới. */
export const EMPTY_LINE: EditableLine = {
  description: '',
  quantity: '1',
  unitPrice: '',
}
