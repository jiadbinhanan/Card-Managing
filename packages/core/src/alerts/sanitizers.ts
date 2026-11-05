import { MetaComponent } from '../types';

/**
 * Sanitizes strings for Meta Cloud API parameters:
 * - Normalizes to Unicode NFC.
 * - Replaces non-breaking/narrow spaces and newlines with a single space.
 * - Strips non-printable ASCII and control characters.
 * - Enforces max length (default 60 chars per Meta parameter limit).
 */
export function sanitizeMetaString(val: string | number | null | undefined, maxLen: number = 60): string {
  if (val === null || val === undefined || val === '') return 'N/A';
  return String(val)
    .normalize('NFC')
    .replace(/[\u202F\u00A0]/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '')
    .trim()
    .substring(0, maxLen);
}

/**
 * Cleans a phone number to digits only.
 */
export function cleanPhoneNumber(phone: string | null | undefined): string {
  return (phone || '').replace(/[^0-9]/g, '');
}

/**
 * Builds Meta Cloud API parameter components array (header and body).
 */
export function buildMetaComponents(
  headerParam: { name: string; value: string } | null,
  bodyParams: Record<string, string>
): MetaComponent[] {
  const comps: MetaComponent[] = [];
  if (headerParam) {
    comps.push({
      type: 'header',
      parameters: [{ type: 'text', parameter_name: headerParam.name, text: headerParam.value }],
    });
  }
  comps.push({
    type: 'body',
    parameters: Object.entries(bodyParams).map(([k, v]) => ({
      type: 'text',
      parameter_name: k,
      text: String(v),
    })),
  });
  return comps;
}
