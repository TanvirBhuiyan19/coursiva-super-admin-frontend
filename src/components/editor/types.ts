import type { Ref } from 'react';
import type { EditorFeature } from './features';

/** Imperative access for buttons outside the editor (e.g. merge tags). */
export interface RichTextHandle {
  /** Inserts plain text at the caret (or the end when the editor was never focused) and focuses the editor. */
  insert: (text: string) => void;
  focus: () => void;
}

export interface RichTextEditorProps {
  /** From `Field`: the editor is labelled by the field's label (`{id}-label`). */
  id?: string;
  /** Accessible name when the editor isn't inside a `Field`. */
  'aria-label'?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  /** Markdown. */
  value: string;
  onChange: (markdown: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  /** What the field may contain (presets FULL / STANDARD / BASIC); default STANDARD. Read once, on mount. */
  features?: readonly EditorFeature[];
  /** Shows a counter of the Markdown length; the server enforces the limit. */
  maxLength?: number;
  /** Editing area height in px. */
  minHeight?: number;
  disabled?: boolean;
  className?: string;
  /** Set once the editor has loaded; null while it is loading or in the Markdown source view. */
  handle?: Ref<RichTextHandle | null>;
}
