const defaultApiUrl = 'http://155.212.167.68:80'

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

export const API_URL = trimTrailingSlash(defaultApiUrl)
