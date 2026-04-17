interface UserSnapshot {
  id: string
  username: string
  displayName: string
  avatar?: string | null
}

const SNAPSHOT_KEY = 'light-user-snapshot'
const TOKEN_KEY = 'light-token'

export function setStoredUser(user: UserSnapshot): void {
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(user))
  } catch (err) {
    console.error('Failed to save user snapshot:', err)
  }
}

export function getStoredUser(): UserSnapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY)
    return raw ? JSON.parse(raw) : null
  } catch (err) {
    console.error('Failed to load user snapshot:', err)
    return null
  }
}

export function clearStoredUser(): void {
  try {
    localStorage.removeItem(SNAPSHOT_KEY)
  } catch (err) {
    console.error('Failed to clear user snapshot:', err)
  }
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}
