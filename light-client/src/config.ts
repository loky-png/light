// FIX: IP-адрес вынесен в переменную окружения VITE_API_URL
// В файле .env.local укажите: VITE_API_URL=http://155.212.167.68:80
// Для production: VITE_API_URL=https://ваш-домен.com
const defaultApiUrl = import.meta.env.VITE_API_URL ?? 'http://155.212.167.68:80'

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

export const API_URL = trimTrailingSlash(defaultApiUrl)
