import { PartialType } from '@nestjs/swagger';
import { CreateSalesInvoiceDto } from './create-sales-invoice.dto.js';

export class UpdateSalesInvoiceDto extends PartialType(CreateSalesInvoiceDto) {}
