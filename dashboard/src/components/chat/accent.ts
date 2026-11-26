import type { CSSProperties } from 'react';

// Décline la couleur d'accent en variables CSS (fond doux + bordure) consommées
// par le fil. À poser en style inline sur un conteneur englobant.
export function accentStyle(color: string): CSSProperties {
  return {
    '--chat-accent': color,
    '--chat-accent-soft': `color-mix(in srgb, ${color} 12%, white)`,
    '--chat-accent-border': `color-mix(in srgb, ${color} 35%, white)`,
  } as CSSProperties;
}
