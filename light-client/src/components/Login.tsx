import { useState } from 'react'
import { API_URL } from '../api/socket'
import { getPublicKeyBase64 } from '../api/crypto'
import './Login.css'

interface LoginProps {
  onLogin: (token: string, user: { id: string; username: string; displayName: string }) => void
}

export default function Login({ onLogin }: LoginProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    setError('')
    if (mode === 'register') {
      if (!displayName.trim()) return setError('Введите имя')
      if (username.length < 4) return setError('Юзернейм минимум 4 символа')
    }
    setLoading(true)
    try {
      const body = mode === 'login'
        ? { username, password }
        : { username, password, displayName: displayName.trim(), publicKey: getPublicKeyBase64() }

      // Используем Electron net.fetch через IPC или обычный fetch
      const doFetch = async (url: string, opts: RequestInit) => {
        const w = window as Window & { lightAPI?: { fetch: (u: string, o: RequestInit) => Promise<{ok: boolean, status: number, text: string}> } }
        console.log('lightAPI available:', !!w.lightAPI?.fetch)
        if (w.lightAPI?.fetch) {
          const r = await w.lightAPI.fetch(url, opts)
          console.log('IPC response:', r.status, r.text.slice(0, 100))
          if (!r.ok) throw new Error(JSON.parse(r.text).error || 'Ошибка')
          return JSON.parse(r.text)
        }
        console.log('Using regular fetch')
        const res = await fetch(url, opts)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Ошибка')
        return data
      }

      const data = await doFetch(`${API_URL}/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      
      // Сохраняем ТОЛЬКО токен, данные пользователя передаем в App
      console.log('Auth response:', data)
      onLogin(data.token, data.user)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка подключения')
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') submit()
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">☀</div>
        <h1 className="login-title">Light</h1>
        <p className="login-subtitle">
          {mode === 'login' ? 'Войдите в аккаунт' : 'Создайте аккаунт'}
        </p>

        {mode === 'register' && (
          <input
            className="login-input"
            placeholder="Имя (можно с фамилией)"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            onKeyDown={handleKey}
          />
        )}
        <div className="login-input-wrap">
          {mode === 'register' && <span className="login-at">@</span>}
          <input
            className={`login-input ${mode === 'register' ? 'with-at' : ''}`}
            placeholder={mode === 'register' ? 'username (мин. 4 символа)' : 'Логин'}
            value={username}
            onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            onKeyDown={handleKey}
            autoComplete="username"
          />
        </div>
        <input
          className="login-input"
          type="password"
          placeholder="Пароль"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={handleKey}
          autoComplete="current-password"
        />

        {error && <p className="login-error">{error}</p>}

        <button className="login-btn" onClick={submit} disabled={loading}>
          {loading ? '...' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
        </button>

        <button className="login-switch" onClick={() => { setMode(m => m === 'login' ? 'register' : 'login'); setError('') }}>
          {mode === 'login' ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
        </button>
      </div>
    </div>
  )
}
