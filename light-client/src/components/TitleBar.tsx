import { useState, useEffect } from 'react'
import './TitleBar.css'

// Electron IPC через preload
declare global {
  interface Window {
    lightAPI?: {
      minimize: () => void
      maximize: () => void
      close: () => void
    }
  }
}

interface TitleBarProps {
  username?: string
}

export default function TitleBar({ username }: TitleBarProps) {
  const [isConnected, setIsConnected] = useState(true)
  
  useEffect(() => {
    const handleConnected = () => setIsConnected(true)
    const handleDisconnected = () => setIsConnected(false)
    
    window.addEventListener('socket:connected', handleConnected)
    window.addEventListener('socket:disconnected', handleDisconnected)
    
    return () => {
      window.removeEventListener('socket:connected', handleConnected)
      window.removeEventListener('socket:disconnected', handleDisconnected)
    }
  }, [])
  
  const minimize = () => window.lightAPI?.minimize()
  const maximize = () => window.lightAPI?.maximize()
  const close = () => window.lightAPI?.close()

  return (
    <div className="titlebar">
      <div className="titlebar-drag" />
      <div className="titlebar-left">
        <span className="titlebar-title">Light {username ? `· ${username}` : ''}</span>
        {!isConnected && <span className="connection-status">Нет соединения</span>}
      </div>
      <div className="titlebar-controls">
        <button className="tb-btn tb-close" onClick={close} aria-label="Закрыть">
          <span />
        </button>
        <button className="tb-btn tb-minimize" onClick={minimize} aria-label="Свернуть">
          <span />
        </button>
        <button className="tb-btn tb-maximize" onClick={maximize} aria-label="Развернуть">
          <span />
        </button>
      </div>
    </div>
  )
}
