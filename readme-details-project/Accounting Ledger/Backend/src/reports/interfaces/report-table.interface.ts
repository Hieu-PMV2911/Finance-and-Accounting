/**
 * Biểu diễn trung lập của một báo cáo để xuất file.
 *
 * Cả ba báo cáo đều được quy về cùng một cấu trúc bảng, nhờ vậy chỉ cần **một**
 * bộ ghi Excel/PDF duy nhất thay vì mỗi báo cáo một bản.
 */
export interface ReportTableColumn {
  header: string;
  align?: 'left' | 'right';
  /** Độ rộng tương đối (dùng cho Excel/PDF). */
  width?: number;
}

export interface ReportTable {
  title: string;
  /** Dòng phụ đề (khoảng thời gian / ngày lập). */
  subtitle: string;
  columns: ReportTableColumn[];
  /** Ô dạng chuỗi đã định dạng sẵn (số tiền đã có dấu phân cách). */
  rows: string[][];
  /** Dòng tổng (in đậm ở cuối bảng). */
  footers: string[][];
  notes: string[];
}
