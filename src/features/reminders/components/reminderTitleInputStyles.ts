import { StyleSheet } from 'react-native';

import { palette } from '../../../constants/colors';

export const reminderTitleInputStyles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  label: {
    marginBottom: 6,
    color: palette.inkSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  input: {
    width: '100%',
    minHeight: 56,
    borderRadius: 16,
    paddingLeft: 16,
    paddingRight: 64,
    paddingVertical: 14,
    color: palette.ink,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '500',
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.line,
  },
  inputFocused: {
    borderColor: 'rgba(121,87,213,0.62)',
    shadowColor: palette.lavenderDeep,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
  },
  count: {
    position: 'absolute',
    right: 12,
    bottom: 7,
    color: palette.inkSecondary,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  countWarning: {
    color: palette.warningText,
  },
  countOverLimit: {
    color: palette.dangerText,
  },
});
