export class PIISanitizer {
  private static readonly EMAIL_REGEX = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
  private static readonly PHONE_REGEX = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g;
  private static readonly SSN_REGEX = /\b\d{3}-?\d{2}-?\d{4}\b/g;

  /**
   * Sanitize a single value
   */
  static sanitizeValue(value: unknown, key?: string): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'string') {
      return this.sanitizeString(value, key);
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeValue(item, key));
    }

    if (typeof value === 'object') {
      return this.sanitizeObject(value as Record<string, unknown>);
    }

    return value;
  }

  /**
   * Sanitize an object recursively
   */
  static sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = this.sanitizeValue(value, key);
    }

    return sanitized;
  }

  /**
   * Sanitize a string value
   */
  private static sanitizeString(value: string, key?: string): string {
    let sanitized = value;

    // Check key name for context
    const keyLower = key?.toLowerCase() || '';

    // Email sanitization
    if (keyLower.includes('email') || this.EMAIL_REGEX.test(value)) {
      sanitized = sanitized.replace(this.EMAIL_REGEX, '[REDACTED_EMAIL]');
    }

    // Phone number sanitization
    if (keyLower.includes('phone') || this.PHONE_REGEX.test(value)) {
      sanitized = sanitized.replace(this.PHONE_REGEX, '[REDACTED_PHONE]');
    }

    // SSN sanitization
    if (keyLower.includes('ssn') || keyLower.includes('social')) {
      sanitized = '[REDACTED_SSN]';
    } else {
      sanitized = sanitized.replace(this.SSN_REGEX, '[REDACTED_SSN]');
    }

    return sanitized;
  }

  /**
   * Check if a value contains PII
   */
  static containsPII(value: unknown): boolean {
    if (typeof value === 'string') {
      return (
        this.EMAIL_REGEX.test(value) || this.PHONE_REGEX.test(value) || this.SSN_REGEX.test(value)
      );
    }

    if (Array.isArray(value)) {
      return value.some((item) => this.containsPII(item));
    }

    if (typeof value === 'object' && value !== null) {
      return Object.values(value).some((v) => this.containsPII(v));
    }

    return false;
  }
}
