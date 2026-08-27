import { useState } from 'react';
import { FxBox } from '../primitives/FxBox.js';
import { FxText } from '../primitives/FxText.js';
import type { ColorMode } from '../theme/tokens.js';
import { cn } from '../utils/cn.js';
import { galleryEntries, type GalleryEntry } from './entries.js';

export interface FxGalleryProps {
  entries?: GalleryEntry[];
  /** Render each demo in both themes side by side (default true). */
  bothThemes?: boolean;
  /** Only show one entry (e.g. from `/gallery/:id`). */
  only?: string;
}

function ThemedPane({ mode, entry }: { mode: ColorMode; entry: GalleryEntry }) {
  const { Component } = entry;
  return (
    <div
      data-theme={mode}
      className="fx-box min-w-0 flex-1 rounded-fx-m border border-border bg-background-app p-4 text-content1"
      style={{ colorScheme: mode }}
    >
      <FxText variant="eyebrow2" color="content3" marginBottom="12">
        {mode}
      </FxText>
      <Component />
    </div>
  );
}

/**
 * Component gallery: every entry rendered in light and dark. Note that portal-based components
 * (sheet, dialog, confirm, toast) attach to <body> and follow the page-level `[data-theme]`.
 */
export function FxGallery({ entries = galleryEntries, bothThemes = true, only }: FxGalleryProps) {
  const [filter, setFilter] = useState('');
  const shown = entries.filter(
    (e) =>
      (!only || e.id === only) && (!filter || e.title.toLowerCase().includes(filter.toLowerCase())),
  );
  return (
    <FxBox gap="24" padding="20" maxWidth={1200} marginHorizontal="auto" width="100%">
      <FxBox
        flexDirection="row"
        alignItems="center"
        justifyContent="space-between"
        gap="12"
        flexWrap="wrap"
      >
        <FxText as="h1" variant="h300">
          fx-ui gallery
        </FxText>
        <input
          aria-label="Filter components"
          placeholder="Filter…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="fx-input h-10 max-w-[240px]"
        />
      </FxBox>
      <nav aria-label="Components" className="flex flex-row flex-wrap gap-2">
        {shown.map((e) => (
          <a
            key={e.id}
            href={`#gallery-${e.id}`}
            className="rounded-fx-s bg-background-secondary px-2 py-1 fx-text-bodyXSRegular text-content2 no-underline"
          >
            {e.title}
          </a>
        ))}
      </nav>
      {shown.map((entry) => (
        <section key={entry.id} id={`gallery-${entry.id}`} className="fx-box gap-3">
          <FxText as="h2" variant="h200">
            {entry.title}
          </FxText>
          <div className={cn('flex gap-4', bothThemes ? 'flex-col desktop:flex-row' : 'flex-col')}>
            <ThemedPane mode="light" entry={entry} />
            {bothThemes && <ThemedPane mode="dark" entry={entry} />}
          </div>
        </section>
      ))}
    </FxBox>
  );
}
