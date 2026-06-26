import { SetMetadata } from '@nestjs/common';

export type ClinicScopedEntity = 'invoice' | 'usgExam';

export interface ClinicScopedMeta {
  entity: ClinicScopedEntity;
  param: string;
}

export const CLINIC_SCOPED_KEY = 'clinicScoped';

/**
 * Declares that the route's :param identifies a row of `entity` which must
 * belong to the current user's clinic. Enforced by ClinicScopeGuard.
 */
export const ClinicScoped = (entity: ClinicScopedEntity, param: string) =>
  SetMetadata(CLINIC_SCOPED_KEY, { entity, param } satisfies ClinicScopedMeta);
