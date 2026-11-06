/**
 * Access 97 VNI-Windows <-> Unicode UTF-8 Bidirectional Converter.
 * Based on the Access 97 engine specification in internal/common-go/vni.
 */

export const VNI_TO_UNICODE_MAP: Record<string, string> = {
  // a with marks
  'aø': 'à', 'aù': 'á', 'aû': 'ả', 'aõ': 'ã', 'aï': 'ạ',
  'AØ': 'À', 'AÙ': 'Á', 'AÛ': 'Ả', 'AÕ': 'Ã', 'AÏ': 'Ạ',

  // â (a circumflex)
  'aâ': 'â', 'aâø': 'ầ', 'aâù': 'ấ', 'aâû': 'ẩ', 'aâõ': 'ẫ', 'aâï': 'ậ',
  'AÂ': 'Â', 'AÂØ': 'Ầ', 'AÂÙ': 'Ấ', 'AÂÛ': 'Ẩ', 'AÂÕ': 'Ẫ', 'AÂÏ': 'Ậ',

  // ă (a breve)
  'aê': 'ă', 'aéø': 'ằ', 'aéù': 'ắ', 'aéû': 'ẳ', 'aéõ': 'ẵ', 'aéï': 'ặ',
  'AÊ': 'Ă', 'AÉØ': 'Ằ', 'AÉÙ': 'Ắ', 'AÉÛ': 'Ẳ', 'AÉÕ': 'Ẵ', 'AÉÏ': 'Ặ',

  // e with marks
  'eø': 'è', 'eù': 'é', 'eû': 'ẻ', 'eõ': 'ẽ', 'eï': 'ẹ',
  'EØ': 'È', 'EÙ': 'É', 'EÛ': 'Ẻ', 'EÕ': 'Ẽ', 'EÏ': 'Ẹ',

  // ê (e circumflex)
  'eâ': 'ê', 'eâø': 'ề', 'eâù': 'ế', 'eâû': 'ể', 'eâõ': 'ễ', 'eâï': 'ệ',
  'EÂ': 'Ê', 'EÂØ': 'Ề', 'EÂÙ': 'Ế', 'EÂÛ': 'Ể', 'EÂÕ': 'Ễ', 'EÂÏ': 'Ệ',

  // o with marks
  'oø': 'ò', 'où': 'ó', 'oû': 'ỏ', 'oõ': 'õ', 'oï': 'ọ',
  'OØ': 'Ò', 'OÙ': 'Ó', 'OÛ': 'Ỏ', 'OÕ': 'Õ', 'OÏ': 'Ọ',

  // ô (o circumflex)
  'oâ': 'ô', 'oâø': 'ồ', 'oâù': 'ố', 'oâû': 'ổ', 'oâõ': 'ỗ', 'oâï': 'ộ',
  'OÂ': 'Ô', 'OÂØ': 'Ồ', 'OÂÙ': 'Ố', 'OÂÛ': 'Ổ', 'OÂÕ': 'Ỗ', 'OÂÏ': 'Ộ',

  // ơ (o horn)
  'ô': 'ơ', 'ôø': 'ờ', 'ôù': 'ớ', 'ôû': 'ở', 'ôõ': 'ỡ', 'ôï': 'ợ',

  // u with marks
  'uø': 'ù', 'uù': 'ú', 'uû': 'ủ', 'uõ': 'ũ', 'uï': 'ụ',
  'UØ': 'Ù', 'UÙ': 'Ú', 'UÛ': 'Ủ', 'UÕ': 'Ũ', 'UÏ': 'Ụ',

  // ư (u horn)
  'ö': 'ư', 'öø': 'ừ', 'öù': 'ứ', 'öû': 'ử', 'öõ': 'ữ', 'öï': 'ự',
  'Ö': 'Ư', 'ÖØ': 'Ừ', 'ÖÙ': 'Ứ', 'ÖÛ': 'Ử', 'ÖÕ': 'Ữ', 'ÖÏ': 'Ự',

  // y with marks
  'yø': 'ỳ', 'yù': 'ý', 'yû': 'ỷ', 'yõ': 'ỹ', 'yï': 'ỵ',

  // đ / Đ
  'ñ': 'đ', 'Ñ': 'Đ',

  // i with marks
  'ì': 'ì', 'í': 'í'
};

// Sorted by length descending for greedy replacement
const VNI_KEYS_SORTED = Object.keys(VNI_TO_UNICODE_MAP).sort((a, b) => b.length - a.length);

// Build inverse mapping: Unicode -> VNI
export const UNICODE_TO_VNI_MAP: Record<string, string> = {};
for (const [vni, uni] of Object.entries(VNI_TO_UNICODE_MAP)) {
  UNICODE_TO_VNI_MAP[uni] = vni;
}
const UNICODE_KEYS_SORTED = Object.keys(UNICODE_TO_VNI_MAP).sort((a, b) => b.length - a.length);

/**
 * Converts VNI-Windows encoded text to standard Unicode UTF-8.
 */
export function vniToUnicode(text: string): string {
  let result = text;
  for (const vni of VNI_KEYS_SORTED) {
    if (result.includes(vni)) {
      result = result.split(vni).join(VNI_TO_UNICODE_MAP[vni]);
    }
  }
  return result;
}

/**
 * Converts standard Unicode UTF-8 text to Access 97 VNI-Windows encoding.
 */
export function unicodeToVni(text: string): string {
  let result = text;
  for (const uni of UNICODE_KEYS_SORTED) {
    if (result.includes(uni)) {
      result = result.split(uni).join(UNICODE_TO_VNI_MAP[uni]);
    }
  }
  return result;
}

/**
 * Heuristic check if a text contains characteristic VNI-Windows encoded sequences.
 */
export function looksLikeVni(text: string): boolean {
  // Test for distinctive multi-character marks or VNI specific markers
  const VNI_MARKERS = [
    'aø', 'aù', 'aû', 'aõ', 'aï', 'aâ', 'aê', 'aé',
    'eø', 'eù', 'eû', 'eõ', 'eï', 'eâ',
    'oø', 'où', 'oû', 'oõ', 'oï', 'oâ',
    'uø', 'uù', 'uû', 'uõ', 'uï',
    'ö', 'öø', 'öù', 'öû', 'öõ', 'öï',
    'ñ', 'Ñ'
  ];

  return VNI_MARKERS.some((marker) => text.includes(marker));
}
