import type {
  JobName,
  JobQueue,
  JobRunStatus,
  JobTrigger,
} from '../enums/job.enum.js';

/** Số lượng job theo trạng thái trong một hàng đợi BullMQ. */
export interface QueueCounts {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

/** Tình trạng một hàng đợi (đọc trực tiếp từ Redis). */
export interface QueueOverview {
  queue: JobQueue;
  label: string;
  counts: QueueCounts;
  /** `false` khi không kết nối được Redis — các số đếm đều bằng 0. */
  reachable: boolean;
}

/** Một lịch định kỳ (cron) kèm lần chạy gần nhất. */
export interface ScheduleView {
  name: string;
  label: string;
  description: string;
  /** Biểu thức cron 5 trường. */
  cron: string;
  queue: JobQueue;
  jobName: JobName;
  /** Lần chạy gần nhất theo lịch (nếu có). */
  lastRunAt: string | null;
  lastStatus: JobRunStatus | null;
  /** Lần chạy kế tiếp theo cron. */
  nextRunAt: string | null;
}

/** Tóm tắt một lượt chạy job để trả ra API/UI. */
export interface JobRunView {
  id: string;
  queue: JobQueue;
  jobName: JobName | string;
  status: JobRunStatus;
  trigger: JobTrigger;
  triggeredBy: string | null;
  triggeredByEmail: string | null;
  payload: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  error: string | null;
  attempts: number;
  maxAttempts: number;
  progress: number;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  createdAt: string;
}
