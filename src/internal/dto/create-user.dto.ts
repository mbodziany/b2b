import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsString, MinLength, ValidateIf } from 'class-validator';
import { UserRole } from '@prisma/client';

const toBoolean = ({ value }: { value: unknown }) => value === 'on' || value === true || value === 'true';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsEnum(UserRole)
  role!: UserRole;

  @ValidateIf((dto: CreateUserDto) => dto.role === UserRole.CLINIC_USER)
  @IsString()
  clinicId?: string;

  @Transform(toBoolean)
  @IsBoolean()
  canViewInvoices: boolean = false;

  @Transform(toBoolean)
  @IsBoolean()
  canViewUsg: boolean = false;
}
