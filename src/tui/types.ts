// EPIC-008: TUI Types

export interface TUIConfig {
  refreshInterval: number;  // milliseconds
  showHelp: boolean;
  theme: TUITheme;
}

export interface TUITheme {
  primaryColor: string;
  secondaryColor: string;
  successColor: string;
  warningColor: string;
  errorColor: string;
  borderColor: string;
}

export const DEFAULT_THEME: TUITheme = {
  primaryColor: '#6366f1',
  secondaryColor: '#8b5cf6',
  successColor: '#22c55e',
  warningColor: '#f59e0b',
  errorColor: '#ef4444',
  borderColor: '#4b5563',
};

export const DEFAULT_TUI_CONFIG: TUIConfig = {
  refreshInterval: 3000,
  showHelp: true,
  theme: DEFAULT_THEME,
};

export type ScreenType = 'dashboard' | 'projects' | 'sessions' | 'teams' | 'help';

export interface ScreenProps {
  onFocus: boolean;
  onNavigate: (screen: ScreenType) => void;
}
