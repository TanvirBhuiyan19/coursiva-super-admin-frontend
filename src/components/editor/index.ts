// Rich text editor (Lexical, stored as Markdown), ported from tenant-dashboard/src/components/editor: the apps share no
// packages, so keep the two copies in step. The editor itself (Editor.tsx, Lexical, editor.css) is a lazy chunk.
export { RichTextEditor } from './RichTextEditor';
export { preloadRichTextEditor } from './preload';
export { FULL, STANDARD, BASIC, type EditorFeature } from './features';
export type { RichTextEditorProps, RichTextHandle } from './types';
