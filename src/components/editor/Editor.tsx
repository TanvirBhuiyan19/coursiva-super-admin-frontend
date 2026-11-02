// The rich text editor (lazy chunk; import `RichTextEditor` from '@/components/editor'). WYSIWYG on Lexical, stored
// as Markdown: the value in and out is Markdown, so the servers' safe renderers and the student site keep working.
import { HorizontalRuleExtension } from '@lexical/extension';
import { HistoryExtension } from '@lexical/history';
import { AutoLinkNode, LinkExtension } from '@lexical/link';
import { ListExtension } from '@lexical/list';
import { $convertFromMarkdownString, $convertToMarkdownString, type Transformer } from '@lexical/markdown';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalExtensionComposer } from '@lexical/react/LexicalExtensionComposer';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { RichTextExtension } from '@lexical/rich-text';
import { mergeRegister } from '@lexical/utils';
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  CLEAR_HISTORY_COMMAND,
  COMMAND_PRIORITY_HIGH,
  configExtension,
  defineExtension,
  FORMAT_TEXT_COMMAND,
  type EditorThemeClasses,
} from 'lexical';
import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { cx } from '@/lib/cx';
import { normalizeHref, STANDARD, type EditorFeature } from './features';
import { useT } from './i18n';
import { ImageNode } from './ImageNode';
import { transformersFor } from './markdown';
import { HTML_IMPORT, registerNormalize } from './normalize';
import { Toolbar } from './Toolbar';
import type { RichTextEditorProps, RichTextHandle } from './types';
import './editor.css';

const THEME: EditorThemeClasses = {
  paragraph: 'rte-p',
  heading: { h1: 'rte-h1', h2: 'rte-h2', h3: 'rte-h3', h4: 'rte-h3', h5: 'rte-h3', h6: 'rte-h3' },
  quote: 'rte-quote',
  list: { ul: 'rte-ul', ol: 'rte-ol', listitem: 'rte-li', nested: { listitem: 'rte-li--nested' } },
  link: 'rte-link',
  hr: 'rte-hr',
  hrSelected: 'is-selected',
  text: { bold: 'rte-b', italic: 'rte-i', code: 'rte-code' },
};
/**
 * Lexical escapes every `_` in text; an underscore between two letters/digits can never be emphasis in CommonMark, so
 * it is stored unescaped. That keeps merge tags (`{first_name}`, which the servers substitute before rendering) and
 * words like snake_case intact.
 */
const toMarkdown = (md: string) => md.replace(/(?<=[\p{L}\p{N}])\\_(?=[\p{L}\p{N}])/gu, '_');
/** Updates tagged with this come from the `value` prop, not the user: they don't call `onChange`. */
const SYNC_TAG = 'rte-sync';
/** Text formats Markdown can't store: swallowed so nothing is formatted that would silently vanish on save. */
const UNSTORED = new Set(['underline', 'strikethrough', 'subscript', 'superscript', 'highlight', 'lowercase', 'uppercase', 'capitalize']);

export default function Editor(props: RichTextEditorProps) {
  const { features = STANDARD } = props;
  // Built once per field: features and the initial value are read on mount (later values arrive via the sync below).
  const [setup] = useState(() => {
    const transformers = transformersFor(features);
    const initial = props.value;
    const extension = defineExtension({
      name: '@coursiva/rich-text',
      namespace: 'coursiva-rte',
      theme: THEME,
      nodes: [AutoLinkNode, ImageNode],
      html: { import: HTML_IMPORT },
      editable: !props.disabled,
      $initialEditorState: () => $convertFromMarkdownString(initial, transformers),
      onError: (error) => console.error(error),
      dependencies: [
        RichTextExtension,
        HistoryExtension,
        ListExtension,
        configExtension(LinkExtension, { validateUrl: (url: string) => normalizeHref(url) === url, attributes: undefined }),
        HorizontalRuleExtension,
      ],
    });
    return { transformers, extension, initial };
  });
  return (
    <LexicalExtensionComposer extension={setup.extension} contentEditable={null}>
      <Body {...props} features={features} transformers={setup.transformers} initial={setup.initial} />
    </LexicalExtensionComposer>
  );
}

function Body(props: RichTextEditorProps & { features: readonly EditorFeature[]; transformers: Transformer[]; initial: string }) {
  const { value, onChange, features, transformers, disabled = false } = props;
  const t = useT();
  const [editor] = useLexicalComposerContext();
  const [source, setSource] = useState(false);
  // The Markdown the editor last produced or was given: a `value` equal to it is our own echo, not a reset.
  const last = useRef(props.initial);
  const label = props['aria-label'];
  const labelledBy = props.id && !label ? `${props.id}-label` : undefined;
  const over = props.maxLength != null ? value.length - props.maxLength : 0;

  // A new `value` from outside (a reset, an AI draft, the source view) is loaded without being echoed back.
  useEffect(() => {
    if (value === last.current) return;
    last.current = value;
    editor.update(() => $convertFromMarkdownString(value, transformers), { tag: SYNC_TAG });
    editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
  }, [editor, value, transformers]);

  useEffect(() => editor.setEditable(!disabled), [editor, disabled]);

  // Keep the document to what the field stores: unstorable text formats are refused, and whatever arrives anyway
  // (pasted or dropped HTML, legacy Markdown) is normalised by node transforms in every update, so what the author
  // sees is exactly what is saved. Registering marks existing nodes dirty in a history-merge update, which the
  // OnChangePlugin ignores: a value normalised on load reaches `onChange` only with the author's next edit.
  useEffect(
    () =>
      mergeRegister(
        editor.registerCommand(
          FORMAT_TEXT_COMMAND,
          (format) => UNSTORED.has(format) || (format === 'code' && !features.includes('code')),
          COMMAND_PRIORITY_HIGH,
        ),
        registerNormalize(editor, features),
      ),
    [editor, features],
  );

  // A <label for> can't focus a contenteditable: clicking the field's label focuses the editor instead.
  useEffect(() => {
    const el = labelledBy ? document.getElementById(labelledBy) : null;
    if (!el) return undefined;
    const focus = () => editor.focus();
    el.addEventListener('click', focus);
    return () => el.removeEventListener('click', focus);
  }, [editor, labelledBy]);

  useImperativeHandle<RichTextHandle | null, RichTextHandle | null>(
    props.handle,
    () =>
      source
        ? null
        : {
            insert: (text) => {
              editor.update(() => {
                const sel = $getSelection();
                if ($isRangeSelection(sel)) sel.insertText(text);
                else $getRoot().selectEnd().insertText(text);
              });
              editor.focus();
            },
            focus: () => editor.focus(),
          },
    [editor, source],
  );

  return (
    <div
      className={cx('rte', props.className, source && 'rte--source', disabled && 'is-disabled')}
      data-invalid={props['aria-invalid'] || undefined}
    >
      <Toolbar features={features} source={source} onSource={setSource} disabled={disabled} />
      {source && (
        <textarea
          id={props.id}
          className="rte-source"
          aria-label={label ? t('sourceLabel', { label }) : undefined}
          aria-describedby={props['aria-describedby']}
          aria-invalid={props['aria-invalid']}
          value={value}
          disabled={disabled}
          style={{ minHeight: props.minHeight }}
          // The sync effect loads each change into the (hidden) visual editor, so switching back shows it.
          onChange={(e) => onChange(e.target.value)}
          onBlur={props.onBlur}
        />
      )}
      <div className="rte-surface" hidden={source}>
        <ContentEditable
          id={source ? undefined : props.id}
          className="rte-content"
          role="textbox"
          aria-multiline
          aria-label={label}
          aria-labelledby={source ? undefined : labelledBy}
          aria-describedby={props['aria-describedby']}
          aria-invalid={props['aria-invalid']}
          aria-placeholder={props.placeholder ?? ''}
          placeholder={<div className="rte-placeholder">{props.placeholder}</div>}
          style={{ minHeight: props.minHeight }}
          onBlur={props.onBlur}
        />
      </div>
      <MarkdownShortcutPlugin transformers={transformers} />
      <OnChangePlugin
        ignoreSelectionChange
        onChange={(state, _editor, tags) => {
          if (tags.has(SYNC_TAG)) return;
          const md = toMarkdown(state.read(() => $convertToMarkdownString(transformers)));
          if (md === last.current) return;
          last.current = md;
          onChange(md);
        }}
      />
      {props.maxLength != null && (
        <div className={cx('rte-count', over > 0 && 'is-over')} aria-live={over > 0 ? 'polite' : undefined}>
          {over > 0
            ? t('over', { count: over })
            : t('counter', { count: value.length.toLocaleString(), max: props.maxLength.toLocaleString() })}
        </div>
      )}
    </div>
  );
}
