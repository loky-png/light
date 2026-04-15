import nacl from 'tweetnacl'
import { encodeUTF8, decodeUTF8, encodeBase64, decodeBase64 } from 'tweetnacl-util'

export function generateKeyPair() {
  return nacl.box.keyPair()
}

export function encryptMessage(
  text: string,
  recipientPublicKey: Uint8Array,
  mySecretKey: Uint8Array
): string {
  const nonce = nacl.randomBytes(nacl.box.nonceLength)
  const messageUint8 = encodeUTF8(text)
  const encrypted = nacl.box(messageUint8, nonce, recipientPublicKey, mySecretKey)
  
  const fullMessage = new Uint8Array(nonce.length + encrypted.length)
  fullMessage.set(nonce)
  fullMessage.set(encrypted, nonce.length)
  
  return encodeBase64(fullMessage)
}

export function decryptMessage(
  messageWithNonce: string,
  senderPublicKey: Uint8Array,
  mySecretKey: Uint8Array
): string | null {
  const messageWithNonceAsUint8Array = decodeBase64(messageWithNonce)
  const nonce = messageWithNonceAsUint8Array.slice(0, nacl.box.nonceLength)
  const message = messageWithNonceAsUint8Array.slice(nacl.box.nonceLength)
  
  const decrypted = nacl.box.open(message, nonce, senderPublicKey, mySecretKey)
  
  if (!decrypted) {
    return null
  }
  
  return decodeUTF8(decrypted)
}

export function encryptSymmetric(text: string, key: Uint8Array): string {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength)
  const messageUint8 = encodeUTF8(text)
  const encrypted = nacl.secretbox(messageUint8, nonce, key)
  
  const fullMessage = new Uint8Array(nonce.length + encrypted.length)
  fullMessage.set(nonce)
  fullMessage.set(encrypted, nonce.length)
  
  return encodeBase64(fullMessage)
}

export function decryptSymmetric(messageWithNonce: string, key: Uint8Array): string | null {
  const messageWithNonceAsUint8Array = decodeBase64(messageWithNonce)
  const nonce = messageWithNonceAsUint8Array.slice(0, nacl.secretbox.nonceLength)
  const message = messageWithNonceAsUint8Array.slice(nacl.secretbox.nonceLength)
  
  const decrypted = nacl.secretbox.open(message, nonce, key)
  
  if (!decrypted) {
    return null
  }
  
  return decodeUTF8(decrypted)
}

export function getPublicKeyBase64(): string {
  const keyPair = generateKeyPair()
  return encodeBase64(keyPair.publicKey)
}
