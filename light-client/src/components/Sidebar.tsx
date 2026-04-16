import { useState } from 'react'
import { useTheme } from '../context/ThemeContext'
import './Sidebar.css'

interface SidebarProps {
  selectedChatId: string | null
  onSelectChat: (id: string) => void
  currentUser: { id: string; displayName: string; username: string; avatar?: string | null }
  onLogout: () => void
  onUpdateProfile: (displayName: string, username: string, avatar: string | null) => void
  chats: any[]
  onChatCreated: (chat: any) => void
  onChatDeleted: (chatId: string) => void
  token: string
  userStatuses: Record<string, { status: string; lastSeen: number }>
}

export default function Sidebar({ selectedChatId, onSelectChat, currentUser, onLogout, onUpdateProfile, chats, onChatCreated, onChatDeleted, token, userStatuses }: SidebarProps) {
  const [search, setSearch] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(currentUser.displayName)
  const [editUsername, setEditUsername] = useState(currentUser.username)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(currentUser.avatar || null)
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ chatId: string; x: number; y: number } | null>(null)
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

  const handleSaveProfile = async () => {
    try {
      await onUpdateProfile(editName, editUsername, avatarUrl)
      setIsEditing(false)
    } catch (err) {
      console.error('Save profile error:', err)
    }
  }

  const handleChatContextMenu = (e: React.MouseEvent, chatId: string) => {
    e.preventDefault()
    
    // Получаем размеры окна
    const windowWidth = window.innerWidth
    const windowHeight = window.innerHeight
    
    // Примерные размеры меню
    const menuWidth = 180
    const menuHeight = 60
    
    // Вычисляем позицию чтобы меню не вылезало за границы
    let x = e.clientX
    let y = e.clientY
    
    // Проверяем правую границу
    if (x + menuWidth > windowWidth) {
      x = windowWidth - menuWidth - 10
    }
    
    // Проверяем нижнюю границу
    if (y + menuHeight > windowHeight) {
      y = windowHeight - menuHeight - 10
    }
    
    // Проверяем левую границу
    if (x < 10) {
      x = 10
    }
    
    // Проверяем верхнюю границу
    if (y < 10) {
      y = 10
    }
    
    setContextMenu({ chatId, x, y })
  }

  const handleDeleteFromContext = () => {
    if (contextMenu) {
      setDeleteConfirm(contextMenu.chatId)
      setContextMenu(null)
    }
  }

  const handleCancelEdit = () => {
    setEditName(currentUser.displayName)
    setEditUsername(currentUser.username)
    setIsEditing(false)
  }

  const confirmDelete = async () => {
    if (!deleteConfirm) return
    
    try {
      const lightAPI = (window as any).lightAPI
      const result = await lightAPI.fetch(`http://155.212.167.68:80/api/chats/${deleteConfirm}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (result.ok) {
        onChatDeleted(deleteConfirm)
      }
    } catch (err) {
      console.error('Delete chat error:', err)
    } finally {
      setDeleteConfirm(null)
    }
  }

  // Закрываем контекстное меню при клике вне его
  const handleClickOutside = () => {
    setContextMenu(null)
  }

  const handleSearch = async (query: string) => {
    setSearch(query)
    if (query.length < 2) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    
    // Debounce - ждем 300ms перед поиском
    if ((window as any).searchTimeout) {
      clearTimeout((window as any).searchTimeout)
    }
    
    (window as any).searchTimeout = setTimeout(async () => {
      try {
        const lightAPI = (window as any).lightAPI
        const result = await lightAPI.fetch(`http://155.212.167.68:80/api/users/search?q=${encodeURIComponent(query)}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        
        if (result.ok) {
          const users = JSON.parse(result.text)
          // Фильтруем текущего пользователя
          const filtered = users.filter((u: any) => u.id !== currentUser.id)
          setSearchResults(filtered)
        }
      } catch (err) {
        console.error('Search error:', err)
      }
    }, 300)
  }

  const handleSelectUser = async (userId: string) => {
    try {
      const lightAPI = (window as any).lightAPI
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
        console.log('Chat created/found:', data.chat)
        setSearch('')
        setSearchResults([])
        setIsSearching(false)
        
        // Проверяем есть ли уже такой чат в списке
        const existingChat = chats.find(c => c.id === data.chat.id)
        if (!existingChat) {
          // Добавляем новый чат с правильными данными
          onChatCreated(data.chat)
        }
        // Открываем чат
        onSelectChat(data.chat.id)
      } else {
        const error = JSON.parse(result.text)
        if (error.error === 'Cannot create chat with yourself') {
          alert('Нельзя создать чат с самим собой')
        } else {
          alert(error.error || 'Ошибка создания чата')
        }
      }
    } catch (err) {
      console.error('Create chat error:', err)
      alert('Ошибка соединения с сервером')
    }
  }

  return (
    <aside className="sidebar" onClick={handleClickOutside}>
      <div className="sidebar-header">
        <span className="sidebar-logo">☀ Light</span>
        <div className="sidebar-actions">
          <button className="theme-toggle" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}>
            {theme === 'dark' ? '🌙' : '☀️'}
          </button>
          <button className="settings-btn" onClick={() => setShowSettings(!showSettings)} aria-label="Настройки">
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
        {!isSearching && chats.length === 0 && (
          <div className="empty-chats">
            <p>Нет чатов</p>
            <span>Найдите пользователя чтобы начать общение</span>
          </div>
        )}
        {!isSearching && chats.map(chat => (
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
                chat.name?.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) || 'CH'
              )}
              {chat.otherUserId && userStatuses[chat.otherUserId]?.status === 'online' && <div className="online-dot" />}
            </div>
            <div className="chat-info">
              <div className="chat-top">
                <span className="chat-name">{chat.name || 'Чат'}</span>
                {chat.last_message_time && <span className="chat-time">{new Date(chat.last_message_time * 1000).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}</span>}
              </div>
              <div className="chat-bottom">
                <span className="chat-preview">{chat.last_message || 'Нет сообщений'}</span>
                {chat.unread > 0 && <span className="unread-badge">{chat.unread}</span>}
              </div>
            </div>
          </li>
        ))}
      </ul>
      
      {contextMenu && (
        <div 
          className="context-menu" 
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="context-menu-item delete" onClick={handleDeleteFromContext}>
            <span className="context-menu-icon">🗑️</span>
            Удалить чат
          </button>
        </div>
      )}
      
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Удалить чат?</h3>
            <p>Все сообщения будут удалены</p>
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
