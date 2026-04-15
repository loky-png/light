import { useState } from 'react'
import { useTheme } from '../context/ThemeContext'
import './Sidebar.css'

interface SidebarProps {
  selectedChatId: string | null
  onSelectChat: (id: string) => void
  currentUser: { displayName: string; username: string; avatar?: string | null }
  onLogout: () => void
  onUpdateProfile: (displayName: string, username: string, avatar: string | null) => void
}

export default function Sidebar({ currentUser, onLogout, onUpdateProfile }: SidebarProps) {
  const [search, setSearch] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(currentUser.displayName)
  const [editUsername, setEditUsername] = useState(currentUser.username)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(currentUser.avatar || null)
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const { theme, toggleTheme } = useTheme()

  const getInitials = (name: string) => {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  }

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = () => {
        setAvatarUrl(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSaveProfile = () => {
    onUpdateProfile(editName, editUsername, avatarUrl)
    setIsEditing(false)
  }

  const handleCancelEdit = () => {
    setEditName(currentUser.displayName)
    setEditUsername(currentUser.username)
    setIsEditing(false)
  }

  const handleSearch = async (query: string) => {
    setSearch(query)
    if (query.length < 2) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    try {
      const lightAPI = (window as any).lightAPI
      const token = localStorage.getItem('light-token')
      const result = await lightAPI.fetch(`http://155.212.167.68:80/api/users/search?q=${encodeURIComponent(query)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (result.ok) {
        const users = JSON.parse(result.text)
        setSearchResults(users)
      }
    } catch (err) {
      console.error('Search error:', err)
    }
  }

  const handleSelectUser = async (userId: string) => {
    try {
      const lightAPI = (window as any).lightAPI
      const token = localStorage.getItem('light-token')
      const result = await lightAPI.fetch('http://155.212.167.68:80/api/chats/direct', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ userId })
      })
      
      if (result.ok) {
        const data = JSON.parse(result.text)
        setSearch('')
        setSearchResults([])
        setIsSearching(false)
        // TODO: открыть чат
        console.log('Chat created:', data.chat)
      }
    } catch (err) {
      console.error('Create chat error:', err)
    }
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-logo">☀ Light</span>
        <div className="sidebar-actions">
          <button className="theme-toggle" onClick={toggleTheme} title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}>
            {theme === 'dark' ? '🌙' : '☀️'}
          </button>
          <button className="settings-btn" onClick={() => setShowSettings(!showSettings)} title="Настройки">
            ⚙️
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="settings-panel">
          {!isEditing ? (
            <>
              <div className="settings-user">
                <div className="settings-avatar">
                  {(avatarUrl || currentUser.avatar) ? (
                    <img src={avatarUrl || currentUser.avatar!} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    getInitials(currentUser.displayName)
                  )}
                </div>
                <div className="settings-info">
                  <div className="settings-name">{currentUser.displayName}</div>
                  <div className="settings-username">@{currentUser.username}</div>
                </div>
              </div>
              <button className="settings-edit" onClick={() => setIsEditing(true)}>Редактировать профиль</button>
              <button className="settings-logout" onClick={onLogout}>Выйти</button>
            </>
          ) : (
            <div className="settings-edit-form">
              <div className="edit-avatar-section">
                <div className="settings-avatar" style={{ width: '80px', height: '80px', fontSize: '24px' }}>
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    getInitials(editName)
                  )}
                </div>
                <div className="avatar-buttons">
                  <label className="avatar-upload-btn">
                    Изменить фото
                    <input type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: 'none' }} />
                  </label>
                  {avatarUrl && (
                    <button className="avatar-remove-btn" onClick={() => setAvatarUrl(null)}>
                      Удалить фото
                    </button>
                  )}
                </div>
              </div>
              <div className="edit-field">
                <label>Имя</label>
                <input type="text" value={editName} onChange={e => setEditName(e.target.value)} />
              </div>
              <div className="edit-field">
                <label>Имя пользователя</label>
                <input type="text" value={editUsername} onChange={e => setEditUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))} />
              </div>
              <div className="edit-actions">
                <button className="btn-cancel" onClick={handleCancelEdit}>Отмена</button>
                <button className="btn-save" onClick={handleSaveProfile}>Сохранить</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="sidebar-search">
        <input type="text" placeholder="Поиск" value={search} onChange={e => handleSearch(e.target.value)} />
      </div>

      {isSearching && searchResults.length > 0 && (
        <div className="search-results">
          {searchResults.map(user => (
            <div key={user.id} className="search-result-item" onClick={() => handleSelectUser(user.id)}>
              <div className="search-avatar">
                {user.avatar ? (
                  <img src={user.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  user.display_name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
                )}
              </div>
              <div className="search-info">
                <div className="search-name">{user.display_name}</div>
                <div className="search-username">@{user.username}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ul className="chat-list">
        {!isSearching && (
          <div className="empty-chats">
            <p>Нет чатов</p>
            <span>Найдите пользователя чтобы начать общение</span>
          </div>
        )}
      </ul>
    </aside>
  )
}
