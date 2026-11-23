import { createContext, useContext } from 'react';

export const lightColors = {
  background: '#F6F5FB',
  paper: '#FFFFFF',
  surfaceMuted: '#F0EDF9',
  line: '#E4DEEF',
  ink: '#211935',
  metadataLabel: '#000000',
  muted: '#645A74',
  placeholder: '#727272',
  inputPlaceholder: '#767676',
  accent: '#6041BD',
  accentSoft: '#F0EAFD',
  success: '#0B6155',
  successSoft: '#DDF3ED',
  danger: '#9E342B',
  dangerSoft: '#FBE8E5',
  warning: '#875009',
  warningSoft: '#FFF0D5',
  onAccent: '#FFFFFF',
  inverseText: '#FFFFFF',
};

export type Palette = typeof lightColors;

export function metadataValueStyle(colors: Palette) {
  return { color: colors.muted, fontWeight: '500' as const };
}

export const darkColors: Palette = {
  background: '#181421',
  paper: '#241E32',
  surfaceMuted: '#302741',
  line: '#493C5E',
  ink: '#F5F0FC',
  metadataLabel: '#F5F0FC',
  muted: '#C4B8D4',
  placeholder: '#A3A3A3',
  inputPlaceholder: '#999999',
  accent: '#C8B2FF',
  accentSoft: '#392B55',
  success: '#91E1CB',
  successSoft: '#21453E',
  danger: '#FFB2A9',
  dangerSoft: '#542C36',
  warning: '#FFD38B',
  warningSoft: '#513A1F',
  onAccent: '#211935',
  inverseText: '#211935',
};

export type ThemeMode = 'system' | 'light' | 'dark';

export const ThemeContext = createContext<{
  colors: Palette;
  mode: ThemeMode;
  dark: boolean;
  ready: boolean;
  setMode: (mode: ThemeMode) => Promise<void>;
}>({
  colors: lightColors, mode: 'system', dark: false, ready: false, setMode: async () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function createThemedStyles<T>(create: (colors: Palette) => T) {
  const light = create(lightColors);
  const dark = create(darkColors);
  return function useStyles() {
    return useTheme().dark ? dark : light;
  };
}
