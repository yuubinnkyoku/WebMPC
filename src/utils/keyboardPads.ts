export type KeyboardPadShortcut = {
  code: string;
  label: string;
  padIndex: number;
};

export const keyboardPadShortcuts: KeyboardPadShortcut[] = [
  { code: "Digit1", label: "1", padIndex: 0 },
  { code: "Digit2", label: "2", padIndex: 1 },
  { code: "Digit3", label: "3", padIndex: 2 },
  { code: "Digit4", label: "4", padIndex: 3 },
  { code: "KeyQ", label: "Q", padIndex: 4 },
  { code: "KeyW", label: "W", padIndex: 5 },
  { code: "KeyE", label: "E", padIndex: 6 },
  { code: "KeyR", label: "R", padIndex: 7 },
  { code: "KeyA", label: "A", padIndex: 8 },
  { code: "KeyS", label: "S", padIndex: 9 },
  { code: "KeyD", label: "D", padIndex: 10 },
  { code: "KeyF", label: "F", padIndex: 11 },
  { code: "KeyZ", label: "Z", padIndex: 12 },
  { code: "KeyX", label: "X", padIndex: 13 },
  { code: "KeyC", label: "C", padIndex: 14 },
  { code: "KeyV", label: "V", padIndex: 15 }
];

export function getKeyboardPadIndex(code: string): number | undefined {
  return keyboardPadShortcuts.find((shortcut) => shortcut.code === code)?.padIndex;
}

export function getKeyboardPadLabel(padIndex: number): string | undefined {
  return keyboardPadShortcuts.find((shortcut) => shortcut.padIndex === padIndex)?.label;
}
