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
  console.log('[Sidebar] userStatuses:', userStatuses)
  console.log('[Sidebar] chats:', chats.map(c => ({ id: c.id, name: c.name, otherUserId: c.otherUserId })))
  
  const [search, setSearch] = useState('')
  const [showSettings, setShowSettings] = useState(false)
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
      <div className="sidebar-header">
        <span className="sidebar-logo">☀ Light</span>
        <div className="sidebar-actions">
          <button className="theme-toggle" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}>
            {theme === 'dark' ? '🌙' : '☀️'}
          </button>
          <button className="settings-btn" onClick={() => setShowSettings((value) => !value)} aria-label="Настройки">
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
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
            <span className="context-menu-icon">🗑️</span>
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
