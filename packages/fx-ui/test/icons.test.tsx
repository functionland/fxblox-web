import { render } from '@testing-library/react';
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as icons from '../src/icons/index.js';
import { DynamicIcon } from '../src/icons/generated/DynamicIcon.js';
import { FxCheckIcon } from '../src/icons/generated/FxCheckIcon.js';

const generatedDir = resolve(dirname(fileURLToPath(import.meta.url)), '../src/icons/generated');

describe('icons (codemod output)', () => {
  it('generated more than 60 DOM icon components', () => {
    const files = readdirSync(generatedDir).filter((f) => f.endsWith('.tsx'));
    expect(files.length).toBeGreaterThan(60);
    const exported = Object.keys(icons).filter((k) => k.endsWith('Icon') || k === 'Logo');
    expect(exported.length).toBeGreaterThanOrEqual(files.length);
  });

  it('FxSvg: currentColor by default, token → var(--fx-*), decorative unless labelled', () => {
    const { container, rerender } = render(<FxCheckIcon />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('fill', 'currentColor');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg.querySelector('path')).not.toBeNull();

    rerender(<FxCheckIcon color="greenBase" aria-label="Done" width={12} />);
    const labelled = container.querySelector('svg')!;
    expect(labelled).toHaveAttribute('fill', 'var(--fx-green-base)');
    expect(labelled).toHaveAttribute('role', 'img');
    expect(labelled).not.toHaveAttribute('aria-hidden');
    expect(labelled).toHaveAttribute('width', '12');
  });

  it('DynamicIcon renders the given path', () => {
    const { container } = render(<DynamicIcon iconPath="M0 0h10v10H0z" />);
    expect(container.querySelector('path')).toHaveAttribute('d', 'M0 0h10v10H0z');
  });
});
