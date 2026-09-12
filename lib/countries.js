// Country dial codes for the phone-number input.
// `dial` includes the leading "+". Ordered with common markets first.
export const COUNTRY_CODES = [
  { iso: 'JP', dial: '+81',  flag: '🇯🇵', name: '日本 / Japan' },
  { iso: 'US', dial: '+1',   flag: '🇺🇸', name: 'United States' },
  { iso: 'CN', dial: '+86',  flag: '🇨🇳', name: '中国 / China' },
  { iso: 'TW', dial: '+886', flag: '🇹🇼', name: '台灣 / Taiwan' },
  { iso: 'HK', dial: '+852', flag: '🇭🇰', name: '香港 / Hong Kong' },
  { iso: 'KR', dial: '+82',  flag: '🇰🇷', name: '한국 / Korea' },
  { iso: 'GB', dial: '+44',  flag: '🇬🇧', name: 'United Kingdom' },
  { iso: 'AU', dial: '+61',  flag: '🇦🇺', name: 'Australia' },
  { iso: 'SG', dial: '+65',  flag: '🇸🇬', name: 'Singapore' },
  { iso: 'TH', dial: '+66',  flag: '🇹🇭', name: 'Thailand' },
  { iso: 'MY', dial: '+60',  flag: '🇲🇾', name: 'Malaysia' },
  { iso: 'PH', dial: '+63',  flag: '🇵🇭', name: 'Philippines' },
  { iso: 'VN', dial: '+84',  flag: '🇻🇳', name: 'Vietnam' },
  { iso: 'ID', dial: '+62',  flag: '🇮🇩', name: 'Indonesia' },
  { iso: 'IN', dial: '+91',  flag: '🇮🇳', name: 'India' },
  { iso: 'FR', dial: '+33',  flag: '🇫🇷', name: 'France' },
  { iso: 'DE', dial: '+49',  flag: '🇩🇪', name: 'Germany' },
  { iso: 'CA', dial: '+1',   flag: '🇨🇦', name: 'Canada' },
  { iso: 'NZ', dial: '+64',  flag: '🇳🇿', name: 'New Zealand' },
  { iso: 'AE', dial: '+971', flag: '🇦🇪', name: 'UAE' },
];

// Split a stored full phone string like "+81 90-1234-5678" into
// { dial: '+81', number: '90-1234-5678' }. Best-effort.
export function splitPhone(full) {
  if (!full) return { dial: '+81', number: '' };
  const compact = String(full).replace(/\s/g, '');
  const match = COUNTRY_CODES
    .slice()
    .sort((a, b) => b.dial.length - a.dial.length)
    .find(c => compact.startsWith(c.dial));
  if (match) {
    return { dial: match.dial, number: compact.slice(match.dial.length) };
  }
  return { dial: '+81', number: String(full) };
}
