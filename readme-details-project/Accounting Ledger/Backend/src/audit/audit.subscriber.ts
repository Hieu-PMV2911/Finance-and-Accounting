import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  DataSource,
  type EntitySubscriberInterface,
  EventSubscriber,
  type InsertEvent,
  type QueryDeepPartialEntity,
  type RemoveEvent,
  type UpdateEvent,
} from 'typeorm';

import { auditContext } from './audit-context.js';
import { AuditLog } from './entities/audit-log.entity.js';
import { AuditAction } from './enums/audit-action.enum.js';

/**
 * Bảng không ghi vết.
 * - `audit_logs`: ghi log cho chính bảng log sẽ lặp vô hạn.
 * - `account_balances`: bảng **dẫn xuất**, mọi thay đổi của nó đã được phản ánh
 *   qua `journal_entries`/`journal_lines` — ghi thêm chỉ làm loãng vết.
 * - `refresh_tokens`: dữ liệu phiên đăng nhập, ngoài phạm vi kiểm toán nghiệp vụ.
 */
const EXCLUDED_TABLES = new Set([
  'audit_logs',
  'account_balances',
  'refresh_tokens',
]);

/** Trường nhạy cảm — không bao giờ được lọt vào vết kiểm toán. */
const SENSITIVE_FIELDS = new Set([
  'passwordHash',
  'password',
  'tokenHash',
  'token',
  'refreshToken',
  'accessToken',
]);

function truncate(value: string | null, max: number): string | null {
  if (value === null) return null;
  return value.length > max ? value.slice(0, max) : value;
}

/**
 * Ảnh chụp entity để lưu vào `before`/`after`.
 *
 * Chỉ giữ **trường vô hướng**. Quan hệ (mảng/đối tượng lồng nhau) bị bỏ vì hai
 * lý do: entity quan hệ vòng qua nhau nên `JSON.stringify` sẽ nổ, và ảnh chụp
 * phình to không cần thiết — các trường cần đối chiếu (trạng thái, số hiệu,
 * số tiền, mốc thời gian) đều là vô hướng.
 */
function scalarSnapshot(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;

  const snapshot: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_FIELDS.has(key)) continue;
    if (raw === null) {
      snapshot[key] = null;
    } else if (raw instanceof Date) {
      snapshot[key] = raw.toISOString();
    } else if (
      typeof raw === 'string' ||
      typeof raw === 'number' ||
      typeof raw === 'boolean'
    ) {
      snapshot[key] = raw;
    }
  }

  return Object.keys(snapshot).length > 0 ? snapshot : null;
}

/**
 * Tự động ghi vết kiểm toán cho **mọi thay đổi entity** (mục 8).
 *
 * Đăng ký bằng cách đẩy vào `dataSource.subscribers` trong constructor — cách
 * này hoạt động cùng `autoLoadEntities` mà không cần khai báo glob trong cấu
 * hình TypeORM.
 *
 * Vết được ghi bằng `event.manager` nên nằm **cùng transaction** với thao tác
 * nghiệp vụ: giao dịch rollback thì vết cũng biến mất — không bao giờ có
 * chuyện "đã ghi vết" cho một thay đổi không xảy ra.
 *
 * Thao tác ngoài request (seed, script, cron) không có danh tính người dùng nên
 * được bỏ qua.
 */
@Injectable()
@EventSubscriber()
export class AuditSubscriber implements EntitySubscriberInterface {
  constructor(@InjectDataSource() dataSource: DataSource) {
    dataSource.subscribers.push(this);
  }

  async afterInsert(event: InsertEvent<Record<string, unknown>>): Promise<void> {
    await this.record(event, AuditAction.CREATE, null, event.entity);
  }

  async afterUpdate(event: UpdateEvent<Record<string, unknown>>): Promise<void> {
    await this.record(
      event,
      AuditAction.UPDATE,
      event.databaseEntity ?? null,
      event.entity ?? null,
    );
  }

  async afterRemove(event: RemoveEvent<Record<string, unknown>>): Promise<void> {
    await this.record(
      event,
      AuditAction.DELETE,
      event.databaseEntity ?? event.entity ?? null,
      null,
    );
  }

  private async record(
    event: InsertEvent<unknown> | UpdateEvent<unknown> | RemoveEvent<unknown>,
    action: AuditAction,
    before: unknown,
    after: unknown,
  ): Promise<void> {
    const table = event.metadata.tableName;
    if (EXCLUDED_TABLES.has(table)) return;

    const context = auditContext.getStore();
    if (!context) return;

    const entityId = this.resolveEntityId(event, before, after);

    // `jsonb` nhận object thô; ép kiểu vì `QueryDeepPartialEntity` không mô tả
    // được cột jsonb (nó map theo `keyof` nên ra kiểu rỗng với Record).
    const row = {
      actorId: context.actorId,
      actorEmail: context.actorEmail,
      action,
      entity: table,
      entityId,
      before: scalarSnapshot(before),
      after: scalarSnapshot(after),
      method: truncate(context.method, 8),
      path: truncate(context.path, 255),
      ip: truncate(context.ip, 64),
      userAgent: truncate(context.userAgent, 512),
    } as unknown as QueryDeepPartialEntity<AuditLog>;

    await event.manager.insert(AuditLog, row);
  }

  private resolveEntityId(
    event: InsertEvent<unknown> | UpdateEvent<unknown> | RemoveEvent<unknown>,
    before: unknown,
    after: unknown,
  ): string | null {
    const fromEvent = (event as { entityId?: unknown }).entityId;
    if (fromEvent !== undefined && fromEvent !== null) {
      return String(fromEvent).slice(0, 64);
    }

    for (const candidate of [after, before]) {
      if (candidate && typeof candidate === 'object' && 'id' in candidate) {
        const id = (candidate as { id?: unknown }).id;
        if (typeof id === 'string') return id.slice(0, 64);
      }
    }

    return null;
  }
}
