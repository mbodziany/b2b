import { Transform } from 'class-transformer';
import { IsBoolean } from 'class-validator';

const toBoolean = ({ value }: { value: unknown }) => value === 'on' || value === true || value === 'true';

export class UpdatePermissionsDto {
  @Transform(toBoolean)
  @IsBoolean()
  canViewInvoices: boolean = false;

  @Transform(toBoolean)
  @IsBoolean()
  canViewUsg: boolean = false;
}
