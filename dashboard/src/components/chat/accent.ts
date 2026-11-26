import type { CSSProperties } from 'react';

// Variables CSS de la couleur d'accent.
export function accentStyle(color: string): CSSProperties {
  return {
    '--chat-accent': color,
    '--chat-accent-soft': `color-mix(in srgb, ${color} 12%, white)`,
    '--chat-accent-border': `color-mix(in srgb, ${color} 35%, white)`,
  } as CSSProperties;
}
