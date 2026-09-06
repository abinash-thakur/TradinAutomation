import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// Encryption key derived from master secret or fallback
const MASTER_KEY = crypto
  .createHash('sha256')
  .update(process.env.ENCRYPTION_SECRET || 'trading-automation-master-secret-key-2026')
  .digest();

export class CryptoUtil {
  /**
   * Encrypts plaintext string using AES-256-GCM
   */
  static encrypt(text: string): string {
    if (!text) return '';
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, MASTER_KEY, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    // Format: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  /**
   * Decrypts encrypted string using AES-256-GCM
   */
  static decrypt(encryptedText: string): string {
    if (!encryptedText) return '';
    try {
      const parts = encryptedText.split(':');
      if (parts.length !== 3) {
        return encryptedText; // Legacy or unencrypted fallback
      }
      const [ivHex, authTagHex, cipherHex] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const decipher = crypto.createDecipheriv(ALGORITHM, MASTER_KEY, iv);
      
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (err) {
      console.error('Failed to decrypt value', err);
      return '';
    }
  }

  /**
   * Masks sensitive credentials for UI display
   */
  static mask(value: string): string {
    if (!value || value.length < 8) return '••••••••';
    return `${value.slice(0, 4)}••••${value.slice(-4)}`;
  }
}

