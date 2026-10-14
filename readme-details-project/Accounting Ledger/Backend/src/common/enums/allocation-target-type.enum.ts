export enum AllocationTargetType {
  SALES_INVOICE = 'sales_invoice',
  VENDOR_BILL = 'vendor_bill',
}

export const ALL_ALLOCATION_TARGET_TYPES: readonly AllocationTargetType[] = Object.values(AllocationTargetType);
