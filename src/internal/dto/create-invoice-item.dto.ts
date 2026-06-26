import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateInvoiceItemDto {
  @IsString()
  @MinLength(1)
  patientReference!: string;

  @IsString()
  @MinLength(1)
  serviceCode!: string;

  @IsString()
  @MinLength(1)
  serviceName!: string;

  @IsDateString()
  serviceDate!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number = 1;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
