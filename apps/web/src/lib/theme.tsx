import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';
export type Accent = 'teal' | 'blue' | 'violet' | 'amber' | 'rose';

interface Preferences {
  theme?: ThemeMode;
  accent?: Accent;
  reducedTransparency?: boolean;
  reducedMotion?: boolean;
}

interface ThemeState extends Required<Preferences> {
  setMode: (mode: ThemeMode) => void;
  setAccent: (accent: Accent) => void;
  setReducedTransparency: (value: boolean) => void;
  setReducedMotion: (value: boolean) => void;
  applyPreferences: (prefs: Preferences) => void;
  effectiveTheme: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeState | null>(null);

function read<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(`saldio.${key}`);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>(() => read('theme', 'system'));
  const [accent, setAccentState] = useState<Accent>(() => read('accent', 'teal'));
  const [reducedTransparency, setReducedTransparencyState] = useState(() =>
    read('reducedTransparency', false),
  );
  const [reducedMotion, setReducedMotionState] = useState(() =>
    read('reducedMotion', window.matchMedia('(prefers-reduced-motion: reduce)').matches),
  );
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  const effectiveTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = effectiveTheme;
    root.dataset.accent = accent;
    root.dataset.reducedTransparency = String(reducedTransparency);
    root.dataset.reducedMotion = String(reducedMotion);
    root.style.colorScheme = effectiveTheme;
    localStorage.setItem('saldio.theme', JSON.stringify(theme));
    localStorage.setItem('saldio.accent', JSON.stringify(accent));
    localStorage.setItem('saldio.reducedTransparency', JSON.stringify(reducedTransparency));
    localStorage.setItem('saldio.reducedMotion', JSON.stringify(reducedMotion));
  }, [effectiveTheme, accent, reducedTransparency, reducedMotion, theme]);

  const setMode = useCallback((mode: ThemeMode) => setTheme(mode), []);
  const setAccent = useCallback((value: Accent) => setAccentState(value), []);
  const setReducedTransparency = useCallback((value: boolean) => setReducedTransparencyState(value), []);
  const setReducedMotion = useCallback((value: boolean) => setReducedMotionState(value), []);
  const applyPreferences = useCallback((prefs: Preferences) => {
    if (prefs.theme) setTheme(prefs.theme);
    if (prefs.accent) setAccentState(prefs.accent);
    if (prefs.reducedTransparency !== undefined) setReducedTransparencyState(prefs.reducedTransparency);
    if (prefs.reducedMotion !== undefined) setReducedMotionState(prefs.reducedMotion);
  }, []);

  const value = useMemo<ThemeState>(
    () => ({
      theme,
      accent,
      reducedTransparency,
      reducedMotion,
      effectiveTheme,
      setMode,
      setAccent,
      setReducedTransparency,
      setReducedMotion,
      applyPreferences,
    }),
    [theme, accent, reducedTransparency, reducedMotion, effectiveTheme, setMode, setAccent, setReducedTransparency, setReducedMotion, applyPreferences],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme debe usarse dentro de ThemeProvider');
  return context;
}
