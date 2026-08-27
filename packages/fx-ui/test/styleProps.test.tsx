import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FxBox } from '../src/primitives/FxBox.js';
import { FxText } from '../src/primitives/FxText.js';
import { resolveStyleProps } from '../src/primitives/styleProps.js';

describe('resolveStyleProps', () => {
  it('maps spacing keys, colour tokens and radii; passes the rest through', () => {
    const { style, rest } = resolveStyleProps({
      padding: '16',
      marginTop: '8',
      paddingHorizontal: '20',
      backgroundColor: 'backgroundPrimary',
      borderRadius: 's',
      borderWidth: 1,
      borderColor: 'border',
      flexDirection: 'row',
      width: 40,
      height: '100%',
      opacity: 0.5,
      id: 'x',
      onClick: undefined,
    });
    expect(style).toEqual({
      padding: '16px',
      marginTop: '8px',
      paddingLeft: '20px',
      paddingRight: '20px',
      backgroundColor: 'var(--fx-background-primary)',
      borderRadius: '4px',
      borderWidth: '1px',
      borderColor: 'var(--fx-border)',
      borderStyle: 'solid',
      flexDirection: 'row',
      width: '40px',
      height: '100%',
      opacity: 0.5,
    });
    expect(rest).toEqual({ id: 'x' });
  });

  it('raw numbers/strings and non-token colours pass through', () => {
    const { style } = resolveStyleProps({ margin: 3, color: '#ff0000', lineHeight: 20, start: 10 });
    expect(style).toEqual({
      margin: '3px',
      color: '#ff0000',
      lineHeight: '20px',
      insetInlineStart: '10px',
    });
  });
});

describe('FxBox / FxText', () => {
  it('FxBox is a flex column div with resolved inline styles and testID', () => {
    render(
      <FxBox testID="box" padding="12" flexDirection="row" as="section">
        hi
      </FxBox>,
    );
    const el = screen.getByTestId('box');
    expect(el.tagName).toBe('SECTION');
    expect(el.className).toContain('fx-box');
    expect(el.style.padding).toBe('12px');
    expect(el.style.flexDirection).toBe('row');
  });

  it('FxText applies the variant class, colour token and numberOfLines clamp', () => {
    render(
      <FxText testID="t" variant="h200" color="content3" numberOfLines={2}>
        Title
      </FxText>,
    );
    const el = screen.getByTestId('t');
    expect(el.className).toContain('fx-text-h200');
    expect(el.style.color).toBe('var(--fx-content3)');
    expect(el.style.getPropertyValue('-webkit-line-clamp')).toBe('2');
    expect(el).toHaveAttribute('title', 'Title');
  });
});
