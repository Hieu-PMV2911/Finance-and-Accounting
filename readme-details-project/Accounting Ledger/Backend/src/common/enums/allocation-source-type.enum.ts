export enum AllocationSourceType {
  PAYMENT = 'payment',
  CREDIT_NOTE = 'credit_note',
}

export const ALL_ALLOCATION_SOURCE_TYPES: readonly AllocationSourceType[] = Object.values(AllocationSourceType);
