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
        <input type="text" placeholder="Поиск" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <ul className="chat-list">
        <div className="empty-chats">
          <p>Нет чатов</p>
          <span>Найдите пользователя чтобы начать общение</span>
        </div>
      </ul>
    </aside>
  )
}
