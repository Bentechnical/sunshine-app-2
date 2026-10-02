// Display formatting for stored phone numbers: "6475029377" / "+1 647-502-9377" → "(647) 502-9377".
// Anything that isn't a 10-digit North American number is returned unchanged.
export function formatPhoneDisplay(raw: string | null | undefined): string {
  if (!raw) return '';
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10) return raw;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
