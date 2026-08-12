const { domainToASCII } = require('node:url');

const LOCAL_PART_PATTERN = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/iu;
const DOMAIN_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/iu;

function normalizeEmail(value) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().normalize('NFKC').toLowerCase();
  const parts = normalized.split('@');
  if (parts.length !== 2) return normalized;
  const asciiDomain = domainToASCII(parts[1]);
  return asciiDomain ? `${parts[0]}@${asciiDomain}` : normalized;
}

function validateEmail(value) {
  const email = normalizeEmail(value);
  if (!email || email.length > 254 || /[\s\u0000-\u001f\u007f]/u.test(email)) {
    return 'Địa chỉ email không hợp lệ.';
  }
  const parts = email.split('@');
  if (parts.length !== 2) return 'Địa chỉ email không hợp lệ.';
  const [local, domain] = parts;
  const labels = domain.split('.');
  if (
    !local
    || local.length > 64
    || local.startsWith('.')
    || local.endsWith('.')
    || local.includes('..')
    || !LOCAL_PART_PATTERN.test(local)
    || !domain
    || domain.length > 253
    || labels.length < 2
    || labels.some((label) => !DOMAIN_LABEL_PATTERN.test(label))
  ) {
    return 'Địa chỉ email không hợp lệ.';
  }
  return '';
}

module.exports = { normalizeEmail, validateEmail };
