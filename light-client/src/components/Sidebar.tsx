import { useEffect, useRef, useState } from 'react'
import { requestJson } from '../api/http'
import { useTheme } from '../context/ThemeContext'
import { useToast } from '../context/ToastContext'
import type { AuthUser, ChatSummary, UserStatus } from '../types'
import './Sidebar.css'

interface SearchUser {
  id: string
  username: string
  display_name: string
  avatar: string | null
}

interface SidebarProps {
  selectedChatId: string | null
  onSelectChat: (id: string) => void
  currentUser: AuthUser
  onLogout: () => void
  onUpdateProfile: (displayName: string, username: string, avatar: string | null) => void
  chats: ChatSummary[]
  onChatCreated: (chat: ChatSummary) => void
  onChatDeleted: (chatId: string) => void
  token: string
  userStatuses: Record<string, UserStatus>
}

export default function Sidebar({
  selectedChatId,
  onSelectChat,
  currentUser,
  onLogout,
  onUpdateProfile,
  chats,
  onChatCreated,
  onChatDeleted,
  token,
  userStatuses
}: SidebarProps) {
  const [search, setSearch] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'profile' | 'general' | 'privacy' | 'notifications'>('profile')
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(currentUser.displayName)
  const [editUsername, setEditUsername] = useState(currentUser.username)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(currentUser.avatar || null)
  const [searchResults, setSearchResults] = useState<SearchUser[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ chatId: string; x: number; y: number } | null>(null)

  const searchTimeoutRef = useRef<number | null>(null)
  const { theme, toggleTheme } = useTheme()
  const toast = useToast()

  useEffect(() => {
    setEditName(currentUser.displayName)
    setEditUsername(currentUser.username)
    setAvatarUrl(currentUser.avatar || null)
  }, [currentUser])

  useEffect(() => {
    // Очистка таймера при размонтировании
    return () => {
      if (searchTimeoutRef.current) {
        window.clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [])

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((word) => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) {
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Файл слишком большой. Максимум 5 МБ.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setAvatarUrl(typeof reader.result === 'string' ? reader.result : null)
    }
    reader.readAsDataURL(file)
  }

  const handleSaveProfile = async () => {
    try {
      const data = await requestJson<{ user: AuthUser }>('/api/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          displayName: editName,
          username: editUsername,
          avatar: avatarUrl
        })
      })

      await onUpdateProfile(data.user.displayName, data.user.username, data.user.avatar || null)
      setEditName(data.user.displayName)
      setEditUsername(data.user.username)
      setAvatarUrl(data.user.avatar || null)
      setIsEditing(false)
      toast.success('Профиль обновлён')
    } catch (error) {
      console.error('Save profile error:', error)
      toast.error(error instanceof Error ? error.message : 'Ошибка соединения с сервером')
    }
  }

  const handleChatContextMenu = (e: React.MouseEvent, chatId: string) => {
    e.preventDefault()

    const menuWidth = 180
    const menuHeight = 60

    let x = e.clientX
    let y = e.clientY

    if (x + menuWidth > window.innerWidth) {
      x = window.innerWidth - menuWidth - 10
    }
    if (y + menuHeight > window.innerHeight) {
      y = window.innerHeight - menuHeight - 10
    }

    setContextMenu({
      chatId,
      x: Math.max(10, x),
      y: Math.max(10, y)
    })
  }

  const handleCancelEdit = () => {
    setEditName(currentUser.displayName)
    setEditUsername(currentUser.username)
    setAvatarUrl(currentUser.avatar || null)
    setIsEditing(false)
  }

  const confirmDelete = async () => {
    if (!deleteConfirm) {
      return
    }

    try {
      await requestJson<{ success: boolean }>(`/api/chats/${deleteConfirm}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })

      onChatDeleted(deleteConfirm)
      toast.success('Чат скрыт')
    } catch (error) {
      console.error('Delete chat error:', error)
      toast.error(error instanceof Error ? error.message : 'Не удалось удалить чат')
    } finally {
      setDeleteConfirm(null)
    }
  }

  const handleSearch = (query: string) => {
    setSearch(query)

    if (searchTimeoutRef.current) {
      window.clearTimeout(searchTimeoutRef.current)
    }

    const trimmedQuery = query.trim()
    if (trimmedQuery.length < 2) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    searchTimeoutRef.current = window.setTimeout(async () => {
      try {
        const users = await requestJson<SearchUser[]>(`/api/users/search?q=${encodeURIComponent(trimmedQuery)}`, {
          headers: { Authorization: `Bearer ${token}` }
        })

        setSearchResults(users.filter((candidate) => candidate.id !== currentUser.id))
      } catch (error) {
        console.error('Search error:', error)
        setSearchResults([])
      } finally {
        setIsSearching(false)
      }
    }, 300)
  }

  const handleSelectUser = async (userId: string) => {
    try {
      const data = await requestJson<{ chat: ChatSummary }>('/api/chats/direct', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ userId })
      })

      setSearch('')
      setSearchResults([])
      setIsSearching(false)
      onChatCreated(data.chat)
      onSelectChat(data.chat.id)
    } catch (error) {
      console.error('Create chat error:', error)
      toast.error(error instanceof Error ? error.message : 'Ошибка создания чата')
    }
  }

  const isSearchActive = search.trim().length >= 2

  return (
    <aside className="sidebar" onClick={() => setContextMenu(null)}>
      {/* Панель настроек поверх сайдбара */}
      {showSettings && (
        <div className="settings-overlay">
          <div className="settings-sidebar">
            <div className="settings-sidebar-header">
              <button className="settings-back-btn" onClick={() => setShowSettings(false)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 12H5M12 19l-7-7 7-7"/>
                </svg>
              </button>
              <span className="settings-sidebar-title">Настройки</span>
            </div>

            <div className="settings-tabs">
              <button 
                className={`settings-tab ${settingsTab === 'profile' ? 'active' : ''}`}
                onClick={() => setSettingsTab('profile')}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="8" r="4"/>
                  <path d="M4 20c0-4 3.5-6 8-6s8 2 8 6"/>
                </svg>
                Профиль
              </button>
              <button 
                className={`settings-tab ${settingsTab === 'general' ? 'active' : ''}`}
                onClick={() => setSettingsTab('general')}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
                Основные
              </button>
              <button 
                className={`settings-tab ${settingsTab === 'privacy' ? 'active' : ''}`}
                onClick={() => setSettingsTab('privacy')}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
                Приватность
              </button>
              <button 
                className={`settings-tab ${settingsTab === 'notifications' ? 'active' : ''}`}
                onClick={() => setSettingsTab('notifications')}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                Уведомления
              </button>
            </div>

            <div className="settings-content">
              {settingsTab === 'profile' && (
                <div className="settings-section">
                  {!isEditing ? (
                    <>
                      <div className="settings-profile-card">
                        <div className="settings-profile-avatar">
                          {avatarUrl ? (
                            <img src={avatarUrl} alt="Avatar" />
                          ) : (
                            getInitials(currentUser.displayName)
                          )}
                        </div>
                        <div className="settings-profile-info">
                          <div className="settings-profile-name">{currentUser.displayName}</div>
                          <div className="settings-profile-username">@{currentUser.username}</div>
                        </div>
                      </div>
                      <button className="settings-btn-primary" onClick={() => setIsEditing(true)}>
                        Редактировать профиль
                      </button>
                      <div className="settings-divider" />
                      <button className="settings-btn-danger" onClick={onLogout}>
                        <span>Выйти из аккаунта</span>
                      </button>
                    </>
                  ) : (
                    <div className="settings-edit-form">
                      <div className="edit-avatar-section">
                        <div className="settings-profile-avatar" style={{ width: '100px', height: '100px', fontSize: '32px' }}>
                          {avatarUrl ? (
                            <img src={avatarUrl} alt="Avatar" />
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
                              Удалить
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="edit-field">
                        <label>Имя</label>
                        <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} />
                      </div>
                      <div className="edit-field">
                        <label>Имя пользователя</label>
                        <input
                          type="text"
                          value={editUsername}
                          onChange={(e) => setEditUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                        />
                      </div>
                      <div className="edit-actions">
                        <button className="btn-cancel" onClick={handleCancelEdit}>Отмена</button>
                        <button className="btn-save" onClick={handleSaveProfile}>Сохранить</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {settingsTab === 'general' && (
                <div className="settings-section">
                  <div className="settings-group">
                    <div className="settings-group-title">Внешний вид</div>
                    <div className="settings-item">
                      <div className="settings-item-info">
                        <div className="settings-item-label">Тема оформления</div>
                        <div className="settings-item-desc">Светлая или тёмная тема</div>
                      </div>
                      <button className="settings-toggle" onClick={toggleTheme}>
                        {theme === 'dark' ? 'Светлая' : 'Тёмная'}
                      </button>
                    </div>
                    <div className="settings-item">
                      <div className="settings-item-info">
                        <div className="settings-item-label">Размер шрифта</div>
                        <div className="settings-item-desc">Маленький, средний или большой</div>
                      </div>
                      <button className="settings-toggle">Средний</button>
                    </div>
                  </div>

                  <div className="settings-group">
                    <div className="settings-group-title">Чаты</div>
                    <div className="settings-item">
                      <div className="settings-item-info">
                        <div className="settings-item-label">Отправка по Enter</div>
                        <div className="settings-item-desc">Отправлять сообщения клавишей Enter</div>
                      </div>
                      <label className="settings-switch">
                        <input type="checkbox" defaultChecked />
                        <span className="settings-switch-slider" />
                      </label>
                    </div>
                    <div className="settings-item">
                      <div className="settings-item-info">
                        <div className="settings-item-label">Автозагрузка медиа</div>
                        <div className="settings-item-desc">Автоматически загружать фото и видео</div>
                      </div>
                      <label className="settings-switch">
                        <input type="checkbox" defaultChecked />
                        <span className="settings-switch-slider" />
                      </label>
                    </div>
                  </div>

                  <div className="settings-group">
                    <div className="settings-group-title">Язык</div>
                    <div className="settings-item">
                      <div className="settings-item-info">
                        <div className="settings-item-label">Язык интерфейса</div>
                        <div className="settings-item-desc">Русский</div>
                      </div>
                      <button className="settings-toggle">Изменить</button>
                    </div>
                  </div>
                </div>
              )}

              {settingsTab === 'privacy' && (
                <div className="settings-section">
                  <div className="settings-group">
                    <div className="settings-group-title">Конфиденциальность</div>
                    <div className="settings-item">
                      <div className="settings-item-info">
                        <div className="settings-item-label">Последняя активность</div>
                        <div className="settings-item-desc">Кто может видеть когда вы были в сети</div>
                      </div>
                      <button className="settings-toggle">Все</button>
                    </div>
                    <div className="settings-item">
                      <div className="settings-item-info">
                        <div className="settings-item-label">Аватар</div>
                        <div className="settings-item-desc">Кто может видеть ваше фото профиля</div>
                      </div>
                      <button className="settings-toggle">Все</button>
                    </div>
                    <div className="settings-item">
                      <div className="settings-item-info">
                        <div className="settings-item-label">Статус "печатает"</div>
                        <div className="settings-item-desc">Показывать когда вы печатаете</div>
                      </div>
                      <label className="settings-switch">
                        <input type="checkbox" defaultChecked />
                        <span className="settings-switch-slider" />
                      </label>
                    </div>
                  </div>

                  <div className="settings-group">
                    <div className="settings-group-title">Безопасность</div>
                    <div className="settings-item">
                      <div className="settings-item-info">
                        <div className="settings-item-label">Двухфакторная аутентификация</div>
                        <div className="settings-item-desc">Дополнительная защита аккаунта</div>
                      </div>
                      <button className="settings-toggle">Включить</button>
                    </div>
                    <div className="settings-item">
                      <div className="settings-item-info">
                        <div className="settings-item-label">Активные сеансы</div>
                        <div className="settings-item-desc">Управление устройствами</div>
                      </div>
                      <button className="settings-toggle">Показать</button>
                    </div>
                  </div>

                  <div className="settings-group">
                    <div className="settings-group-title">Блокировка</div>
                    <div className="settings-item">
                      <div className="settings-item-info">
                        <div className="settings-item-label">Заблокированные пользователи</div>
                        <div className="settings-item-desc">Список заблокированных контактов</div>
                      </div>
                      <button className="settings-toggle">0</button>
                    </div>
                  </div>
                </div>
              )}

              {settingsTab === 'notifications' && (
                <div className="settings-section">
                  <div className="settings-group">
                    <div className="settings-group-title">Уведомления</div>
                    <div className="settings-item">
                      <div className="settings-item-info">
                        <div className="settings-item-label">Показывать уведомления</div>
                        <div className="settings-item-desc">Получать уведомления о новых сообщениях</div>
                      </div>
                      <label className="settings-switch">
                        <input type="checkbox" defaultChecked />
                        <span className="settings-switch-slider" />
                      </label>
                    </div>
                    <div className="settings-item">
                      <div className="settings-item-info">
                        <div className="settings-item-label">Звук уведомлений</div>
                        <div className="settings-item-desc">Воспроизводить звук при получении сообщения</div>
                      </div>
                      <label className="settings-switch">
                        <input type="checkbox" defaultChecked />
                        <span className="settings-switch-slider" />
                      </label>
                    </div>
                    <div className="settings-item">
                      <div className="settings-item-info">
                        <div className="settings-item-label">Предпросмотр сообщений</div>
                        <div className="settings-item-desc">Показывать текст сообщения в уведомлении</div>
                      </div>
                      <label className="settings-switch">
                        <input type="checkbox" defaultChecked />
                        <span className="settings-switch-slider" />
                      </label>
                    </div>
                  </div>

                  <div className="settings-group">
                    <div className="settings-group-title">Режим "Не беспокоить"</div>
                    <div className="settings-item">
                      <div className="settings-item-info">
                        <div className="settings-item-label">Включить режим</div>
                        <div className="settings-item-desc">Отключить все уведомления</div>
                      </div>
                      <label className="settings-switch">
                        <input type="checkbox" />
                        <span className="settings-switch-slider" />
                      </label>
                    </div>
                    <div className="settings-item">
                      <div className="settings-item-info">
                        <div className="settings-item-label">Расписание</div>
                        <div className="settings-item-desc">Автоматически включать в определённое время</div>
                      </div>
                      <button className="settings-toggle">Настроить</button>
                    </div>
                  </div>

                  <div className="settings-group">
                    <div className="settings-group-title">Исключения</div>
                    <div className="settings-item">
                      <div className="settings-item-info">
                        <div className="settings-item-label">Важные чаты</div>
                        <div className="settings-item-desc">Всегда получать уведомления от этих чатов</div>
                      </div>
                      <button className="settings-toggle">Добавить</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="sidebar-header">
        <span className="sidebar-logo">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ marginRight: '8px', verticalAlign: 'middle' }}>
            <circle cx="12" cy="12" r="5" fill="currentColor"/>
            <path d="M12 1v3M12 20v3M23 12h-3M4 12H1M20.5 3.5l-2 2M5.5 18.5l-2 2M20.5 20.5l-2-2M5.5 5.5l-2-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          Light
        </span>
        <div className="sidebar-actions">
          <button className="theme-toggle" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}>
            {theme === 'dark' ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/>
                <line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/>
                <line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            )}
          </button>
          <button className="settings-btn" onClick={() => setShowSettings((value) => !value)} aria-label="Настройки">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Убрал старую панель настроек сверху */}

      <div className="sidebar-search">
        <input type="text" placeholder="Поиск" value={search} onChange={(e) => handleSearch(e.target.value)} />
      </div>

      {isSearchActive && (
        <div className="search-results">
          {isSearching ? (
            <div className="search-result-item">Поиск...</div>
          ) : searchResults.length > 0 ? (
            searchResults.map((user) => (
              <div key={user.id} className="search-result-item" onClick={() => handleSelectUser(user.id)}>
                <div className="search-avatar">
                  {user.avatar ? (
                    <img src={user.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    getInitials(user.display_name)
                  )}
                </div>
                <div className="search-info">
                  <div className="search-name">{user.display_name}</div>
                  <div className="search-username">@{user.username}</div>
                </div>
              </div>
            ))
          ) : (
            <div className="search-result-item">Ничего не найдено</div>
          )}
        </div>
      )}

      <ul className="chat-list">
        {chats.length === 0 ? (
          <li className="empty-chats">
            <p>Нет чатов</p>
            <span>Найдите пользователя, чтобы начать общение</span>
          </li>
        ) : (
          chats.map((chat) => (
            <li
              key={chat.id}
              className={`chat-item ${selectedChatId === chat.id ? 'active' : ''}`}
              onClick={() => onSelectChat(chat.id)}
              onContextMenu={(e) => handleChatContextMenu(e, chat.id)}
            >
              <div className="chat-avatar">
                {chat.avatar ? (
                  <img src={chat.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                ) : (
                  getInitials(chat.name || 'Чат')
                )}
                {chat.otherUserId && (
                  userStatuses[chat.otherUserId]?.status === 'online'
                    ? <div className="online-dot" />
                    : <div className="offline-dot" />
                )}
              </div>
              <div className="chat-info">
                <div className="chat-top">
                  <span className="chat-name">{chat.name || 'Чат'}</span>
                  {chat.last_message_time && (
                    <span className="chat-time">
                      {new Date(chat.last_message_time * 1000).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
                <div className="chat-bottom">
                  <span className="chat-preview">{chat.last_message || 'Нет сообщений'}</span>
                  {chat.unread > 0 && <span className="unread-badge">{chat.unread}</span>}
                </div>
              </div>
            </li>
          ))
        )}
      </ul>

      {contextMenu && (
        <div
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="context-menu-item delete" onClick={() => {
            setDeleteConfirm(contextMenu.chatId)
            setContextMenu(null)
          }}>
            <svg className="context-menu-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              <line x1="10" y1="11" x2="10" y2="17"/>
              <line x1="14" y1="11" x2="14" y2="17"/>
            </svg>
            Удалить чат
          </button>
        </div>
      )}

      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Удалить чат?</h3>
            <p>Чат скроется только у вас и вернётся, если в него придёт новое сообщение.</p>
            <div className="modal-actions">
              <button className="modal-btn modal-cancel" onClick={() => setDeleteConfirm(null)}>Отмена</button>
              <button className="modal-btn modal-delete" onClick={confirmDelete}>Удалить</button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
