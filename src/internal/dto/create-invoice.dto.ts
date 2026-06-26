import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateInvoiceDto {
  @IsString()
  clinicId!: string;

  @IsString()
  @MinLength(1)
  invoiceNumber!: string;

  @IsDateString()
  issueDate!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalAmount!: number;

  @IsOptional()
  @IsString()
  currency?: string;
}
