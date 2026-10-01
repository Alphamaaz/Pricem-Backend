const blockedPatterns = [
  { pattern: /[a-z0-9._%+-]+\s*@\s*[a-z0-9.-]+\s*\.\s*[a-z]{2,}/i, reason: 'email addresses' },
  { pattern: /(?:https?:\/\/|www\.|t\.me\/|bit\.ly\/)/i, reason: 'external links' },
  { pattern: /@[a-z0-9_.]{3,}/i, reason: 'social-media handles' },
  { pattern: /\b(?:telegram|instagram|facebook|snapchat|tiktok|twitter|x)\s*(?:me|dm|handle|id)?\b/i, reason: 'off-platform social handles' },
];

const preOrderBlockedPatterns = [
  { pattern: /\b(?:whatsapp)\s*(?:me|dm|handle|id|number)?\b/i, reason: 'off-platform contact requests' },
  { pattern: /\b(?:call|text|message|contact)\s+me\b/i, reason: 'off-platform contact requests' },
];

function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\s().-]/g, '');
}

export function findBlockedContent(text, { isOrderWorkspace = false } = {}) {
  // In an active order workspace, buyer and seller are coordinating courier logistics
  // and direct payment, so phone numbers and direct calling/messaging are permitted.
  if (isOrderWorkspace) {
    // Only check general external phishing/malicious links
    for (const rule of blockedPatterns) {
      if (rule.pattern.test(text)) return rule.reason;
    }
    return null;
  }

  // In pre-purchase listing chat, block phone numbers, off-platform bypass, etc.
  for (const rule of blockedPatterns) {
    if (rule.pattern.test(text)) return rule.reason;
  }
  for (const rule of preOrderBlockedPatterns) {
    if (rule.pattern.test(text)) return rule.reason;
  }

  const digits = normalizeText(text).replace(/[^0-9]/g, '');
  if (digits.length >= 10 && digits.length <= 15) return 'phone numbers';

  return null;
}
