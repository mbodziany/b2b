/**
 * Thrown by guards when an unauthenticated/partially-authenticated browser
 * request must be sent to a different page (login, MFA, password change)
 * instead of receiving a generic 401/403 response.
 */
export class RedirectException extends Error {
  constructor(public readonly redirectTo: string) {
    super(`Redirect to ${redirectTo}`);
  }
}
