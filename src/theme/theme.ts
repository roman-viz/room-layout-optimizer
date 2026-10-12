export type ThemePreference = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'roomform-theme'

export function getThemePreference(): ThemePreference {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'light' || saved === 'dark' || saved === 'system') return saved
  return 'system'
}

export function setThemePreference(preference: ThemePreference): void {
  localStorage.setItem(STORAGE_KEY, preference)
  applyTheme(preference)
}

export function applyTheme(preference: ThemePreference): void {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const theme = preference === 'system' ? (prefersDark ? 'dark' : 'light') : preference
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}

export function getActiveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference !== 'system') return preference
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
