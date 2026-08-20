const blockedPatterns = [
  { pattern: /[a-z0-9._%+-]+\s*@\s*[a-z0-9.-]+\s*\.\s*[a-z]{2,}/i, reason: 'email addresses' },
  { pattern: /(?:https?:\/\/|www\.|wa\.me\/|t\.me\/|bit\.ly\/|instagram\.com\/|facebook\.com\/|tiktok\.com\/)/i, reason: 'external links' },
  { pattern: /@[a-z0-9_.]{3,}/i, reason: 'social-media handles' },
  { pattern: /\b(?:whatsapp|telegram|instagram|facebook|snapchat|tiktok|twitter|x)\s*(?:me|dm|handle|id|number)?\b/i, reason: 'off-platform contact requests' },
  { pattern: /\b(?:call|text|message|contact)\s+me\b/i, reason: 'off-platform contact requests' },
];

function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\s().-]/g, '');
}

export function findBlockedContent(text) {
  for (const rule of blockedPatterns) {
    if (rule.pattern.test(text)) return rule.reason;
  }

  const digits = normalizeText(text).replace(/[^0-9]/g, '');
  if (digits.length >= 10 && digits.length <= 15) return 'phone numbers';

  return null;
}
