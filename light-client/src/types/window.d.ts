export {}

declare global {
  interface Window {
    lightAPI?: {
      minimize: () => void
      maximize: () => void
      close: () => void
      fetch: (url: string, options: RequestInit) => Promise<{
        ok: boolean
        status: number
        text: string
      }>
      updateProfile: (token: string, data: any) => Promise<{
        ok: boolean
        status: number
        text: string
      }>
    }
    socket?: any
  }
}
