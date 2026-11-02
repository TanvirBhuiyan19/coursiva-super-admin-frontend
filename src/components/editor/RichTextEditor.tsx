import { lazy, Suspense } from 'react';
import { cx } from '@/lib/cx';
import { useT } from './i18n';
import type { RichTextEditorProps } from './types';

import { loadEditor } from './preload';

const Editor = lazy(loadEditor);

/**
 * Rich text field stored as Markdown. The editor (Lexical) loads in its own chunk; until it arrives the field shows
 * the same frame with the current text, read-only, so the layout doesn't jump and nothing typed is lost.
 */
export function RichTextEditor(props: RichTextEditorProps) {
  return (
    <Suspense fallback={<Loading {...props} />}>
      <Editor {...props} />
    </Suspense>
  );
}

function Loading({ value, minHeight, className, placeholder }: RichTextEditorProps) {
  const t = useT();
  return (
    <div className={cx('rte rte--loading', className)} aria-busy="true">
      <div className="rte-toolbar" aria-hidden="true" />
      <div className="rte-content" style={{ minHeight }} role="status" aria-label={t('loading')}>
        {value || <span style={{ color: 'var(--tx4)' }}>{placeholder}</span>}
      </div>
    </div>
  );
}
