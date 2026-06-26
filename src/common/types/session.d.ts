import 'express-session';
import { UserRole } from '@prisma/client';

declare module 'express-session' {
  interface SessionData {
    // Set once full authentication (password + MFA) succeeded.
    userId?: string;
    role?: UserRole;
    clinicId?: string | null;
    // Set after password is verified but before MFA is verified - a
    // partially-authenticated state that grants no access to protected routes.
    pendingMfaUserId?: string;
    // First-login flow: password verified, user must set a new password
    // before anything else is allowed.
    pendingPasswordChangeUserId?: string;
    // Holds the freshly generated TOTP secret while the user scans the QR
    // code, until they prove possession of it by submitting a valid code.
    pendingMfaEnrollmentSecret?: string;
    csrfToken?: string;
    // Timestamp (ms) when full authentication completed - enforces an
    // absolute session lifetime independent of the rolling idle timeout.
    loginAt?: number;
  }
}
