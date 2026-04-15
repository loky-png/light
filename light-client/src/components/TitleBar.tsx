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
  const minimize = () => window.lightAPI?.minimize()
  const maximize = () => window.lightAPI?.maximize()
  const close = () => window.lightAPI?.close()

  return (
    <div className="titlebar">
      <div className="titlebar-drag" />
      <span className="titlebar-title">Light {username ? `· ${username}` : ''}</span>
      <div className="titlebar-controls">
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
