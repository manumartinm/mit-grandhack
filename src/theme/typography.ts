import { TextStyle } from 'react-native';

const fontFamily = {
  regular: 'System',
  medium: 'System',
  bold: 'System',
};

export const typography: Record<string, TextStyle> = {
  h1: { fontSize: 28, fontWeight: '700', lineHeight: 34, letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: '700', lineHeight: 28, letterSpacing: -0.3 },
  h3: { fontSize: 18, fontWeight: '600', lineHeight: 24 },
  body: { fontSize: 16, fontWeight: '400', lineHeight: 22 },
  bodyBold: { fontSize: 16, fontWeight: '600', lineHeight: 22 },
  caption: { fontSize: 13, fontWeight: '500', lineHeight: 18 },
  small: { fontSize: 11, fontWeight: '500', lineHeight: 14, letterSpacing: 0.5, textTransform: 'uppercase' },
  stat: { fontSize: 40, fontWeight: '700', lineHeight: 48, letterSpacing: -1 },
};
