// Country dialling data for the WhatsApp number field.
// `nsn` = national (significant) number without the trunk "0", checked against `re`.
// `ex` = example shown as the placeholder. `tz` = time zones used to pre-select the visitor's country.
// Patterns target mobile numbers (WhatsApp). Countries not listed → "Other" (full international number).
// Used by both the build (to render the <select>) and the browser (to validate).
export const COUNTRIES = [
  { iso: 'EG', dial: '20', flag: '🇪🇬', ar: 'مصر', en: 'Egypt', re: /^1[0125]\d{8}$/, ex: '010 1234 5678', tz: ['Africa/Cairo'] },
  { iso: 'SA', dial: '966', flag: '🇸🇦', ar: 'السعودية', en: 'Saudi Arabia', re: /^5\d{8}$/, ex: '050 123 4567', tz: ['Asia/Riyadh'] },
  { iso: 'AE', dial: '971', flag: '🇦🇪', ar: 'الإمارات', en: 'UAE', re: /^5\d{8}$/, ex: '050 123 4567', tz: ['Asia/Dubai'] },
  { iso: 'KW', dial: '965', flag: '🇰🇼', ar: 'الكويت', en: 'Kuwait', re: /^[4569]\d{7}$/, ex: '5012 3456', tz: ['Asia/Kuwait'] },
  { iso: 'QA', dial: '974', flag: '🇶🇦', ar: 'قطر', en: 'Qatar', re: /^[3567]\d{7}$/, ex: '3312 3456', tz: ['Asia/Qatar'] },
  { iso: 'BH', dial: '973', flag: '🇧🇭', ar: 'البحرين', en: 'Bahrain', re: /^[36]\d{7}$/, ex: '3600 1234', tz: ['Asia/Bahrain'] },
  { iso: 'OM', dial: '968', flag: '🇴🇲', ar: 'عُمان', en: 'Oman', re: /^[79]\d{7}$/, ex: '9212 3456', tz: ['Asia/Muscat'] },
  { iso: 'JO', dial: '962', flag: '🇯🇴', ar: 'الأردن', en: 'Jordan', re: /^7[789]\d{7}$/, ex: '079 123 4567', tz: ['Asia/Amman'] },
  { iso: 'LB', dial: '961', flag: '🇱🇧', ar: 'لبنان', en: 'Lebanon', re: /^(3\d{6}|[78]\d{7})$/, ex: '71 123 456', tz: ['Asia/Beirut'] },
  { iso: 'PS', dial: '970', flag: '🇵🇸', ar: 'فلسطين', en: 'Palestine', re: /^5[69]\d{7}$/, ex: '059 123 4567', tz: ['Asia/Gaza', 'Asia/Hebron'] },
  { iso: 'IQ', dial: '964', flag: '🇮🇶', ar: 'العراق', en: 'Iraq', re: /^7\d{9}$/, ex: '0790 123 4567', tz: ['Asia/Baghdad'] },
  { iso: 'SY', dial: '963', flag: '🇸🇾', ar: 'سوريا', en: 'Syria', re: /^9\d{8}$/, ex: '0944 123 456', tz: ['Asia/Damascus'] },
  { iso: 'YE', dial: '967', flag: '🇾🇪', ar: 'اليمن', en: 'Yemen', re: /^7\d{8}$/, ex: '0712 345 678', tz: ['Asia/Aden'] },
  { iso: 'LY', dial: '218', flag: '🇱🇾', ar: 'ليبيا', en: 'Libya', re: /^9[1-6]\d{7}$/, ex: '091 234 5678', tz: ['Africa/Tripoli'] },
  { iso: 'SD', dial: '249', flag: '🇸🇩', ar: 'السودان', en: 'Sudan', re: /^[19]\d{8}$/, ex: '091 123 1234', tz: ['Africa/Khartoum'] },
  { iso: 'MA', dial: '212', flag: '🇲🇦', ar: 'المغرب', en: 'Morocco', re: /^[67]\d{8}$/, ex: '0650 123 456', tz: ['Africa/Casablanca'] },
  { iso: 'DZ', dial: '213', flag: '🇩🇿', ar: 'الجزائر', en: 'Algeria', re: /^[567]\d{8}$/, ex: '0551 23 45 67', tz: ['Africa/Algiers'] },
  { iso: 'TN', dial: '216', flag: '🇹🇳', ar: 'تونس', en: 'Tunisia', re: /^[2-9]\d{7}$/, ex: '20 123 456', tz: ['Africa/Tunis'] },
  { iso: 'TR', dial: '90', flag: '🇹🇷', ar: 'تركيا', en: 'Türkiye', re: /^5\d{9}$/, ex: '0501 234 56 78', tz: ['Europe/Istanbul'] },
  { iso: 'GB', dial: '44', flag: '🇬🇧', ar: 'المملكة المتحدة', en: 'United Kingdom', re: /^7\d{9}$/, ex: '07400 123456', tz: ['Europe/London'] },
  { iso: 'IE', dial: '353', flag: '🇮🇪', ar: 'أيرلندا', en: 'Ireland', re: /^8\d{8}$/, ex: '085 012 3456', tz: ['Europe/Dublin'] },
  { iso: 'DE', dial: '49', flag: '🇩🇪', ar: 'ألمانيا', en: 'Germany', re: /^1[5-7]\d{8,9}$/, ex: '0151 23456789', tz: ['Europe/Berlin'] },
  { iso: 'FR', dial: '33', flag: '🇫🇷', ar: 'فرنسا', en: 'France', re: /^[67]\d{8}$/, ex: '06 12 34 56 78', tz: ['Europe/Paris'] },
  { iso: 'NL', dial: '31', flag: '🇳🇱', ar: 'هولندا', en: 'Netherlands', re: /^6\d{8}$/, ex: '06 12345678', tz: ['Europe/Amsterdam'] },
  { iso: 'BE', dial: '32', flag: '🇧🇪', ar: 'بلجيكا', en: 'Belgium', re: /^4\d{8}$/, ex: '0470 12 34 56', tz: ['Europe/Brussels'] },
  { iso: 'IT', dial: '39', flag: '🇮🇹', ar: 'إيطاليا', en: 'Italy', re: /^3\d{8,9}$/, ex: '312 345 6789', tz: ['Europe/Rome'], keepZero: true },
  { iso: 'ES', dial: '34', flag: '🇪🇸', ar: 'إسبانيا', en: 'Spain', re: /^[67]\d{8}$/, ex: '612 34 56 78', tz: ['Europe/Madrid'] },
  { iso: 'CH', dial: '41', flag: '🇨🇭', ar: 'سويسرا', en: 'Switzerland', re: /^7[5-9]\d{7}$/, ex: '078 123 45 67', tz: ['Europe/Zurich'] },
  { iso: 'AT', dial: '43', flag: '🇦🇹', ar: 'النمسا', en: 'Austria', re: /^6\d{8,12}$/, ex: '0664 123456', tz: ['Europe/Vienna'] },
  { iso: 'SE', dial: '46', flag: '🇸🇪', ar: 'السويد', en: 'Sweden', re: /^7\d{8}$/, ex: '070 123 45 67', tz: ['Europe/Stockholm'] },
  { iso: 'NO', dial: '47', flag: '🇳🇴', ar: 'النرويج', en: 'Norway', re: /^[49]\d{7}$/, ex: '406 12 345', tz: ['Europe/Oslo'] },
  { iso: 'DK', dial: '45', flag: '🇩🇰', ar: 'الدنمارك', en: 'Denmark', re: /^[2-9]\d{7}$/, ex: '20 12 34 56', tz: ['Europe/Copenhagen'] },
  { iso: 'US', dial: '1', flag: '🇺🇸', ar: 'أمريكا / كندا', en: 'USA / Canada', re: /^[2-9]\d{2}[2-9]\d{6}$/, ex: '(201) 555-0123', tzPrefix: ['America/'] },
  { iso: 'AU', dial: '61', flag: '🇦🇺', ar: 'أستراليا', en: 'Australia', re: /^4\d{8}$/, ex: '0412 345 678', tzPrefix: ['Australia/'] },
  { iso: 'MY', dial: '60', flag: '🇲🇾', ar: 'ماليزيا', en: 'Malaysia', re: /^1\d{8,9}$/, ex: '012 345 6789', tz: ['Asia/Kuala_Lumpur'] },
  { iso: 'XX', dial: '', flag: '🌍', ar: 'دولة تانية', en: 'Other country', re: null, ex: '+44 7400 123456' },
];

export const DEFAULT_COUNTRY = 'EG';

export function countryByIso(iso) {
  return COUNTRIES.find((c) => c.iso === iso) || COUNTRIES[0];
}

/** Best guess of the visitor's country from the browser time zone (no network, no permission). */
export function guessCountry() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const hit = COUNTRIES.find((c) => c.tz?.includes(tz) || c.tzPrefix?.some((p) => tz.startsWith(p)));
    return hit ? hit.iso : DEFAULT_COUNTRY;
  } catch { return DEFAULT_COUNTRY; }
}
