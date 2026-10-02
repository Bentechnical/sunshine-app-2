// Admin-managed orgs created without an email get a placeholder address
// (`<synthetic id>@managed.local`) to satisfy the users table. Never send mail to it.
export const MANAGED_PLACEHOLDER_EMAIL_DOMAIN = '@managed.local';

export function isDeliverableEmail(email: string | null | undefined): email is string {
  return !!email && !email.toLowerCase().endsWith(MANAGED_PLACEHOLDER_EMAIL_DOMAIN);
}
