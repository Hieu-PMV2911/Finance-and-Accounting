import { PartialType } from '@nestjs/swagger';
import { CreateVendorBillDto } from './create-vendor-bill.dto.js';

export class UpdateVendorBillDto extends PartialType(CreateVendorBillDto) {}
