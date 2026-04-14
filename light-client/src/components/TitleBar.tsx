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
  onLogout?: () => void
  username?: string
}

export default function TitleBar({ onLogout, username }: TitleBarProps) {
  const minimize = () => window.lightAPI?.minimize()
  const maximize = () => window.lightAPI?.maximize()
  const close = () => window.lightAPI?.close()

  return (
    <div className="titlebar">
      <div className="titlebar-drag" />
      <span className="titlebar-title">Light {username ? `· ${username}` : ''}</span>
      <div className="titlebar-controls">
        {onLogout && (
          <button className="tb-btn tb-logout" onClick={onLogout} title="Выйти" style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer',fontSize:'13px',padding:'0 8px'}}>
            выйти
          </button>
        )}
        <button className="tb-btn tb-close" onClick={close} title="Закрыть">
          <span />
        </button>
        <button className="tb-btn tb-minimize" onClick={minimize} title="Свернуть">
          <span />
        </button>
        <button className="tb-btn tb-maximize" onClick={maximize} title="Развернуть">
          <span />
        </button>
      </div>
    </div>
  )
}
