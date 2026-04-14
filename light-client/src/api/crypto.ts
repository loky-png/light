import nacl from 'tweetnacl'
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from 'tweetnacl-util'

const KEY_STORAGE = 'light-keypair'

// Генерируем или загружаем ключевую пару пользователя
export function getOrCreateKeyPair(): nacl.BoxKeyPair {
  const stored = localStorage.getItem(KEY_STORAGE)
  if (stored) {
    const { publicKey, secretKey } = JSON.parse(stored)
    return {
      publicKey: decodeBase64(publicKey),
      secretKey: decodeBase64(secretKey),
    }
  }
  const keyPair = nacl.box.keyPair()
  localStorage.setItem(KEY_STORAGE, JSON.stringify({
    publicKey: encodeBase64(keyPair.publicKey),
    secretKey: encodeBase64(keyPair.secretKey),
  }))
  return keyPair
}

export function getPublicKeyBase64(): string {
  return encodeBase64(getOrCreateKeyPair().publicKey)
}

// Шифруем сообщение для получателя (E2E)
export function encryptMessage(text: string, recipientPublicKeyB64: string, mySecretKey: Uint8Array): string {
  const nonce = nacl.randomBytes(nacl.box.nonceLength)
  const message = encodeUTF8(text)
  const recipientPublicKey = decodeBase64(recipientPublicKeyB64)
  const encrypted = nacl.box(message, nonce, recipientPublicKey, mySecretKey)

  // Упаковываем nonce + encrypted в base64
  const full = new Uint8Array(nonce.length + encrypted.length)
  full.set(nonce)
  full.set(encrypted, nonce.length)
  return encodeBase64(full)
}

// Расшифровываем сообщение
export function decryptMessage(encryptedB64: string, senderPublicKeyB64: string, mySecretKey: Uint8Array): string | null {
  try {
    const full = decodeBase64(encryptedB64)
    const nonce = full.slice(0, nacl.box.nonceLength)
    const encrypted = full.slice(nacl.box.nonceLength)
    const senderPublicKey = decodeBase64(senderPublicKeyB64)
    const decrypted = nacl.box.open(encrypted, nonce, senderPublicKey, mySecretKey)
    if (!decrypted) return null
    return decodeUTF8(decrypted)
  } catch {
    return null
  }
}

// Симметричное шифрование для групповых чатов (общий ключ чата)
export function encryptSymmetric(text: string, keyB64: string): string {
  const key = decodeBase64(keyB64)
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength)
  const message = encodeUTF8(text)
  const encrypted = nacl.secretbox(message, nonce, key)
  const full = new Uint8Array(nonce.length + encrypted.length)
  full.set(nonce)
  full.set(encrypted, nonce.length)
  return encodeBase64(full)
}

export function decryptSymmetric(encryptedB64: string, keyB64: string): string | null {
  try {
    const key = decodeBase64(keyB64)
    const full = decodeBase64(encryptedB64)
    const nonce = full.slice(0, nacl.secretbox.nonceLength)
    const encrypted = full.slice(nacl.secretbox.nonceLength)
    const decrypted = nacl.secretbox.open(encrypted, nonce, key)
    if (!decrypted) return null
    return decodeUTF8(decrypted)
  } catch {
    return null
  }
}

// Генерация случайного ключа для чата
export function generateChatKey(): string {
  return encodeBase64(nacl.randomBytes(nacl.secretbox.keyLength))
}
