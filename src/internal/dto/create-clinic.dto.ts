import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateClinicDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(5)
  taxId!: string;

  @IsOptional()
  @IsString()
  address?: string;
}
