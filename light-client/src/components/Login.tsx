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
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    setError('')
    if (mode === 'register') {
      if (!firstName.trim()) return setError('Введите имя')
      if (!lastName.trim()) return setError('Введите фамилию')
      if (username.length < 4) return setError('Юзернейм минимум 4 символа')
    }
    setLoading(true)
    try {
      const displayName = mode === 'register' ? `${firstName.trim()} ${lastName.trim()}` : ''
      const body = mode === 'login'
        ? { username, password }
        : { username, password, displayName, publicKey: getPublicKeyBase64() }

      const res = await fetch(`${API_URL}/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка')
      localStorage.setItem('light-token', data.token)
      localStorage.setItem('light-user', JSON.stringify(data.user))
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
          <div style={{display:'flex', gap:'8px', width:'100%'}}>
            <input
              className="login-input"
              placeholder="Имя"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              onKeyDown={handleKey}
            />
            <input
              className="login-input"
              placeholder="Фамилия"
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              onKeyDown={handleKey}
            />
          </div>
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
