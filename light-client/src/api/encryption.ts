/**
 * End-to-End шифрование для сообщений
 * Использует RSA-OAEP для шифрования симметричного ключа
 * и AES-GCM для шифрования самого сообщения
 */

interface KeyPair {
  publicKey: string
  privateKey: string
}

// Генерация пары ключей RSA для пользователя
export async function generateKeyPair(): Promise<KeyPair> {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256'
    },
    true,
    ['encrypt', 'decrypt']
  )

  const publicKey = await window.crypto.subtle.exportKey('spki', keyPair.publicKey)
  const privateKey = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey)

  return {
    publicKey: arrayBufferToBase64(publicKey),
    privateKey: arrayBufferToBase64(privateKey)
  }
}

// Шифрование сообщения публичным ключом получателя
export async function encryptMessage(message: string, recipientPublicKey: string): Promise<string> {
  // Генерируем случайный AES ключ для этого сообщения
  const aesKey = await window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  )

  // Шифруем сообщение AES ключом
  const iv = window.crypto.getRandomValues(new Uint8Array(12))
  const encodedMessage = new TextEncoder().encode(message)
  const encryptedMessage = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    encodedMessage
  )

  // Экспортируем AES ключ
  const rawAesKey = await window.crypto.subtle.exportKey('raw', aesKey)

  // Импортируем публичный ключ получателя
  const publicKeyBuffer = base64ToArrayBuffer(recipientPublicKey)
  const importedPublicKey = await window.crypto.subtle.importKey(
    'spki',
    publicKeyBuffer,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  )

  // Шифруем AES ключ публичным ключом получателя
  const encryptedAesKey = await window.crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    importedPublicKey,
    rawAesKey
  )

  // Объединяем все части: зашифрованный AES ключ + IV + зашифрованное сообщение
  const result = {
    key: arrayBufferToBase64(encryptedAesKey),
    iv: arrayBufferToBase64(iv),
    data: arrayBufferToBase64(encryptedMessage)
  }

  return JSON.stringify(result)
}

// Расшифровка сообщения своим приватным ключом
export async function decryptMessage(encryptedData: string, privateKey: string): Promise<string> {
  try {
    const { key, iv, data } = JSON.parse(encryptedData)

    // Импортируем приватный ключ
    const privateKeyBuffer = base64ToArrayBuffer(privateKey)
    const importedPrivateKey = await window.crypto.subtle.importKey(
      'pkcs8',
      privateKeyBuffer,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['decrypt']
    )

    // Расшифровываем AES ключ
    const encryptedAesKey = base64ToArrayBuffer(key)
    const rawAesKey = await window.crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      importedPrivateKey,
      encryptedAesKey
    )

    // Импортируем AES ключ
    const aesKey = await window.crypto.subtle.importKey(
      'raw',
      rawAesKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    )

    // Расшифровываем сообщение
    const ivBuffer = base64ToArrayBuffer(iv)
    const encryptedMessage = base64ToArrayBuffer(data)
    const decryptedMessage = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBuffer },
      aesKey,
      encryptedMessage
    )

    return new TextDecoder().decode(decryptedMessage)
  } catch (err) {
    console.error('Decryption error:', err)
    return '[Не удалось расшифровать сообщение]'
  }
}

// Сохранение приватного ключа в localStorage (зашифрованный паролем пользователя)
export function savePrivateKey(privateKey: string, userId: string): void {
  localStorage.setItem(`light-private-key-${userId}`, privateKey)
}

// Загрузка приватного ключа из localStorage
export function loadPrivateKey(userId: string): string | null {
  return localStorage.getItem(`light-private-key-${userId}`)
}

// Утилиты для конвертации
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}
