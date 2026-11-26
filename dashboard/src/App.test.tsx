import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App', () => {
  it("affiche la page d'accueil publique sur /", () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /Vos visiteurs décrivent leurs travaux/ })).toBeInTheDocument();
  });
});
