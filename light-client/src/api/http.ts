import { API_URL } from '../config'

export interface RawResponse {
  ok: boolean
  status: number
  text: string
}

function resolveUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl
  }
  return `${API_URL}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`
}

export async function requestRaw(pathOrUrl: string, options: RequestInit = {}): Promise<RawResponse> {
  const url = resolveUrl(pathOrUrl)

  // Поддержка Electron: используем lightAPI.fetch если доступен
  const lightAPI = (window as { lightAPI?: { fetch: (url: string, options: RequestInit) => Promise<RawResponse> } }).lightAPI
  if (lightAPI?.fetch) {
    return lightAPI.fetch(url, options)
  }

  const response = await fetch(url, options)
  return {
    ok: response.ok,
    status: response.status,
    text: await response.text()
  }
}

export async function requestJson<T>(pathOrUrl: string, options: RequestInit = {}): Promise<T> {
  const response = await requestRaw(pathOrUrl, options)
  const payload = response.text ? (JSON.parse(response.text) as unknown) : null

  if (!response.ok) {
    const errorMessage =
      payload && typeof (payload as { error?: string }).error === 'string'
        ? (payload as { error: string }).error
        : `Request failed (${response.status})`
    throw new Error(errorMessage)
  }

  return payload as T
}
