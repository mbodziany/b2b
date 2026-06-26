import { SetMetadata } from '@nestjs/common';

export type ClinicPermission = 'canViewInvoices' | 'canViewUsg';

export const PERMISSION_KEY = 'permission';
export const RequirePermission = (permission: ClinicPermission) =>
  SetMetadata(PERMISSION_KEY, permission);
