// The editor's toolbar: one tab stop with arrow-key navigation (WAI-ARIA toolbar pattern), toggle buttons that
// reflect the selection (aria-pressed), inline link and image panels, and the Markdown source switch.
import { INSERT_HORIZONTAL_RULE_COMMAND } from '@lexical/extension';
import { HistoryExtension } from '@lexical/history';
import { $isLinkNode, $toggleLink } from '@lexical/link';
import { $isListNode, INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND, ListNode, REMOVE_LIST_COMMAND } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useExtensionSignalValue } from '@lexical/react/useExtensionSignalValue';
import { $createHeadingNode, $createQuoteNode, $isHeadingNode } from '@lexical/rich-text';
import { $setBlocksType } from '@lexical/selection';
import { $findMatchingParent, $getNearestNodeOfType, mergeRegister } from '@lexical/utils';
import {
  $createParagraphNode,
  $createTextNode,
  $getSelection,
  $insertNodes,
  $isRangeSelection,
  $isRootOrShadowRoot,
  $setSelection,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  KEY_DOWN_COMMAND,
  REDO_COMMAND,
  UNDO_COMMAND,
  type BaseSelection,
  type LexicalEditor,
  type LexicalNode,
} from 'lexical';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cx } from '@/lib/cx';
import { useT as useCommonT } from '@/lib/i18n/common';
import { normalizeHref, normalizeImageSrc, type EditorFeature } from './features';
import { useT } from './i18n';
import { $createImageNode } from './ImageNode';

type Block = 'paragraph' | 'h1' | 'h2' | 'h3' | 'quote' | 'bullet' | 'number' | 'other';
interface Selected {
  block: Block;
  bold: boolean;
  italic: boolean;
  code: boolean;
  link: string | null;
}
const NONE: Selected = { block: 'paragraph', bold: false, italic: false, code: false, link: null };

/** An open panel remembers the selection it acts on (focus moves into the panel) and whether text is needed. */
type Panel =
  null | { kind: 'link'; selection: BaseSelection | null; withText: boolean } | { kind: 'image'; selection: BaseSelection | null };

const ICONS = {
  undo: 'M3 7v6h6M21 17a9 9 0 0 0-15-6.7L3 13',
  redo: 'M21 7v6h-6M3 17a9 9 0 0 1 15-6.7L21 13',
  bullet: 'M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01',
  number: 'M10 6h11M10 12h11M10 18h11M4 4h1v5M4 9h2M6 19H4c0-1.2 2-2 2-3.2 0-.9-1.6-1.3-2-.3',
  quote: 'M7 17h3l2-4V7H6v6h3zM15 17h3l2-4V7h-6v6h3z',
  code: 'M16 18l6-6-6-6M8 6l-6 6 6 6',
  link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  image: 'M3 3h18v18H3zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M21 15l-5-5L5 21',
  divider: 'M3 12h18M7 6h10M7 18h10',
  source: 'M2 5h20v14H2zM6 15V9l2.5 3L11 9v6M17 9v6M14.5 12.5 17 15l2.5-2.5',
} as const;

const IS_APPLE = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

function $readSelected(): Selected {
  const sel = $getSelection();
  if (!$isRangeSelection(sel)) return NONE;
  const anchor = sel.anchor.getNode();
  const top =
    anchor.getKey() === 'root'
      ? anchor
      : ($findMatchingParent(anchor, (n) => {
          const p = n.getParent();
          return p !== null && $isRootOrShadowRoot(p);
        }) ?? anchor.getTopLevelElementOrThrow());
  let block: Block = 'other';
  if ($isListNode(top)) {
    const list = $getNearestNodeOfType<ListNode>(anchor, ListNode) ?? top;
    block = list.getListType() === 'number' ? 'number' : 'bullet';
  } else if ($isHeadingNode(top)) {
    const tag = top.getTag();
    block = tag === 'h1' || tag === 'h2' ? tag : 'h3';
  } else if (top.getType() === 'paragraph' || top.getType() === 'root') block = 'paragraph';
  else if (top.getType() === 'quote') block = 'quote';
  const linkNode = $findMatchingParent(anchor, (n): n is LexicalNode => $isLinkNode(n));
  return {
    block,
    bold: sel.hasFormat('bold'),
    italic: sel.hasFormat('italic'),
    code: sel.hasFormat('code'),
    link: linkNode && $isLinkNode(linkNode) ? linkNode.getURL() : null,
  };
}

/** The selection to restore when a panel applies its change (null when the editor never had one). */
const $selectionSnapshot = () => $getSelection()?.clone() ?? null;
const panelFor = (kind: 'link' | 'image', selection: BaseSelection | null, inLink: boolean): Panel =>
  kind === 'link' ? { kind, selection, withText: !inLink && (selection === null || selection.isCollapsed()) } : { kind, selection };

export function Toolbar({
  features,
  source,
  onSource,
  disabled,
}: {
  features: readonly EditorFeature[];
  source: boolean;
  onSource: (on: boolean) => void;
  disabled: boolean;
}) {
  const t = useT();
  const [editor] = useLexicalComposerContext();
  const canUndo = useExtensionSignalValue(HistoryExtension, 'canUndo');
  const canRedo = useExtensionSignalValue(HistoryExtension, 'canRedo');
  const [sel, setSel] = useState(NONE);
  const [panel, setPanel] = useState<Panel>(null);
  const [current, setCurrent] = useState('bold');
  const bar = useRef<HTMLDivElement>(null);
  const on = (f: EditorFeature) => features.includes(f);

  const openPanel = (kind: 'link' | 'image') =>
    setPanel(panelFor(kind, editor.getEditorState().read($selectionSnapshot), sel.link !== null));
  const closePanel = () => {
    setPanel(null);
    editor.focus();
  };

  useEffect(
    () =>
      mergeRegister(
        editor.registerUpdateListener(({ editorState }) => setSel(editorState.read($readSelected))),
        // Ctrl/⌘+K opens the link panel.
        editor.registerCommand(
          KEY_DOWN_COMMAND,
          (e) => {
            if (!features.includes('link') || !(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== 'k') return false;
            e.preventDefault();
            setPanel(panelFor('link', $selectionSnapshot(), $readSelected().link !== null));
            return true;
          },
          COMMAND_PRIORITY_LOW,
        ),
      ),
    [editor, features],
  );

  const setBlock = (block: 'h2' | 'h3' | 'quote') =>
    editor.update(() => {
      const s = $getSelection();
      if (!$isRangeSelection(s)) return;
      if (sel.block === block) $setBlocksType(s, () => $createParagraphNode());
      else $setBlocksType(s, () => (block === 'quote' ? $createQuoteNode() : $createHeadingNode(block)));
    });
  const setList = (kind: 'bullet' | 'number') =>
    editor.dispatchCommand(
      sel.block === kind ? REMOVE_LIST_COMMAND : kind === 'bullet' ? INSERT_UNORDERED_LIST_COMMAND : INSERT_ORDERED_LIST_COMMAND,
      undefined,
    );
  const toggleSource = () => {
    if (source) {
      // Leaving the source view: the visual editor already holds the Markdown (Editor's sync), focus it.
      onSource(false);
      requestAnimationFrame(() => editor.focus());
    } else {
      setPanel(null);
      onSource(true);
    }
  };
  // Roving tab stop: arrow keys move between enabled buttons, Tab leaves the toolbar.
  const onKeyDown = (e: KeyboardEvent) => {
    const buttons = [...(bar.current?.querySelectorAll<HTMLButtonElement>('button[data-tool]:not(:disabled)') ?? [])];
    const i = buttons.findIndex((b) => b === document.activeElement);
    if (i < 0) return;
    const step: Record<string, HTMLButtonElement | undefined> = {
      ArrowRight: buttons[(i + 1) % buttons.length],
      ArrowLeft: buttons[(i - 1 + buttons.length) % buttons.length],
      Home: buttons[0],
      End: buttons.at(-1),
    };
    const next = step[e.key];
    if (!next) return;
    e.preventDefault();
    next.focus();
  };

  const visual = !source && !disabled;
  // The single tab stop must be an enabled button: undo/redo disable themselves, source mode disables the rest.
  const stop = !visual ? 'source' : (current === 'undo' && !canUndo) || (current === 'redo' && !canRedo) ? 'bold' : current;
  const common = { stop, onFocusTool: setCurrent, enabled: visual };
  const format = (f: 'bold' | 'italic' | 'code') => () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, f);

  return (
    <>
      <div ref={bar} className="rte-toolbar" role="toolbar" aria-label={t('toolbar')} onKeyDown={onKeyDown}>
        <div className="rte-group">
          <Tool {...common} id="bold" label={t('tools.bold')} shortcut="B" pressed={sel.bold} onClick={format('bold')}>
            <Glyph text={t('glyphs.bold')} className="is-b" />
          </Tool>
          <Tool {...common} id="italic" label={t('tools.italic')} shortcut="I" pressed={sel.italic} onClick={format('italic')}>
            <Glyph text={t('glyphs.italic')} className="is-i" />
          </Tool>
          {on('code') && (
            <Tool {...common} id="code" label={t('tools.code')} pressed={sel.code} onClick={format('code')}>
              <Icon d={ICONS.code} />
            </Tool>
          )}
          {on('link') && (
            <Tool
              {...common}
              id="link"
              label={t('tools.link')}
              shortcut="K"
              pressed={sel.link !== null || panel?.kind === 'link'}
              onClick={() => openPanel('link')}
            >
              <Icon d={ICONS.link} />
            </Tool>
          )}
        </div>
        {on('headings') && (
          <div className="rte-group">
            <Tool
              {...common}
              id="h2"
              label={t('tools.h2')}
              pressed={sel.block === 'h2' || sel.block === 'h1'}
              onClick={() => setBlock('h2')}
            >
              <Glyph text={t('glyphs.h2')} className="is-h" />
            </Tool>
            <Tool {...common} id="h3" label={t('tools.h3')} pressed={sel.block === 'h3'} onClick={() => setBlock('h3')}>
              <Glyph text={t('glyphs.h3')} className="is-h" />
            </Tool>
          </div>
        )}
        {(on('lists') || on('quote')) && (
          <div className="rte-group">
            {on('lists') && (
              <>
                <Tool {...common} id="bullet" label={t('tools.bullet')} pressed={sel.block === 'bullet'} onClick={() => setList('bullet')}>
                  <Icon d={ICONS.bullet} />
                </Tool>
                <Tool {...common} id="number" label={t('tools.number')} pressed={sel.block === 'number'} onClick={() => setList('number')}>
                  <Icon d={ICONS.number} />
                </Tool>
              </>
            )}
            {on('quote') && (
              <Tool {...common} id="quote" label={t('tools.quote')} pressed={sel.block === 'quote'} onClick={() => setBlock('quote')}>
                <Icon d={ICONS.quote} />
              </Tool>
            )}
          </div>
        )}
        {(on('divider') || on('image')) && (
          <div className="rte-group">
            {on('divider') && (
              <Tool
                {...common}
                id="divider"
                label={t('tools.divider')}
                onClick={() => editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)}
              >
                <Icon d={ICONS.divider} />
              </Tool>
            )}
            {on('image') && (
              <Tool {...common} id="image" label={t('tools.image')} pressed={panel?.kind === 'image'} onClick={() => openPanel('image')}>
                <Icon d={ICONS.image} />
              </Tool>
            )}
          </div>
        )}
        <div className="rte-group rte-group--end">
          <Tool
            {...common}
            id="undo"
            label={t('tools.undo')}
            shortcut="Z"
            enabled={visual && canUndo}
            onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
          >
            <Icon d={ICONS.undo} />
          </Tool>
          <Tool
            {...common}
            id="redo"
            label={t('tools.redo')}
            shortcut={IS_APPLE ? t('glyphs.redoMac') : t('glyphs.redo')}
            enabled={visual && canRedo}
            onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
          >
            <Icon d={ICONS.redo} />
          </Tool>
          <Tool {...common} id="source" label={t('tools.source')} pressed={source} enabled={!disabled} onClick={toggleSource}>
            <Icon d={ICONS.source} />
          </Tool>
        </div>
      </div>
      {panel?.kind === 'link' && (
        <LinkPanel
          initial={sel.link ?? ''}
          withText={panel.withText}
          onCancel={closePanel}
          onApply={(href, text) => {
            applyAt(editor, panel.selection, () => {
              const s = $getSelection();
              if ($isRangeSelection(s) && s.isCollapsed() && panel.withText) {
                const node = $createTextNode(text || href);
                $insertNodes([node]);
                node.select(0, node.getTextContentSize());
              }
              $toggleLink(href);
            });
            closePanel();
          }}
          onRemove={
            sel.link
              ? () => {
                  applyAt(editor, panel.selection, () => $toggleLink(null));
                  closePanel();
                }
              : undefined
          }
        />
      )}
      {panel?.kind === 'image' && (
        <ImagePanel
          onCancel={closePanel}
          onInsert={(src, alt) => {
            applyAt(editor, panel.selection, () => $insertNodes([$createImageNode(src, alt)]));
            closePanel();
          }}
        />
      )}
    </>
  );
}

/** Runs `$change` with the selection the panel was opened on. */
function applyAt(editor: LexicalEditor, selection: BaseSelection | null, $change: () => void) {
  editor.update(() => {
    if (selection) $setSelection(selection.clone());
    $change();
  });
}

function Tool({
  id,
  label,
  shortcut,
  pressed,
  enabled,
  stop,
  onFocusTool,
  onClick,
  children,
}: {
  id: string;
  label: string;
  shortcut?: string;
  pressed?: boolean;
  enabled: boolean;
  stop: string;
  onFocusTool: (id: string) => void;
  onClick: () => void;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <button
      type="button"
      data-tool={id}
      className={cx('rte-btn', pressed && 'is-on')}
      aria-label={label}
      title={shortcut ? t('shortcut', { name: label, key: IS_APPLE ? '⌘' : 'Ctrl', letter: shortcut }) : label}
      aria-pressed={pressed}
      disabled={!enabled}
      tabIndex={stop === id ? 0 : -1}
      onFocus={() => onFocusTool(id)}
      // Keep the editor's selection while clicking a button.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

const Glyph = ({ text, className }: { text: string; className: string }) => (
  <span aria-hidden="true" className={cx('rte-glyph', className)}>
    {text}
  </span>
);

/** Enter applies, Escape cancels (and returns focus to the text). On the panel's inputs: the panel isn't a <form>. */
const panelKeys = (onSubmit: () => void, onCancel: () => void) => (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    onCancel();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    onSubmit();
  }
};

function LinkPanel({
  initial,
  withText,
  onApply,
  onRemove,
  onCancel,
}: {
  initial: string;
  withText: boolean;
  onApply: (href: string, text: string) => void;
  onRemove: (() => void) | undefined;
  onCancel: () => void;
}) {
  const t = useT();
  const tc = useCommonT();
  const id = useId();
  const [url, setUrl] = useState(initial);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    const href = normalizeHref(url);
    if (href) onApply(href, text.trim());
    else setError(t('link.invalid'));
  };
  const keys = panelKeys(submit, onCancel);
  return (
    <PanelShell title={t('link.title')}>
      <label className="rte-panel-label" htmlFor={`${id}-url`}>
        {t('link.url')}
      </label>
      <input
        id={`${id}-url`}
        className="input"
        // eslint-disable-next-line jsx-a11y/no-autofocus -- the panel opens on the user's request; focus belongs in it
        autoFocus
        inputMode="url"
        autoComplete="off"
        placeholder={t('link.urlPh')}
        value={url}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        onKeyDown={keys}
        onChange={(e) => {
          setUrl(e.target.value);
          setError(null);
        }}
      />
      {withText && (
        <>
          <label className="rte-panel-label" htmlFor={`${id}-text`}>
            {t('link.text')}
          </label>
          <input
            id={`${id}-text`}
            className="input"
            autoComplete="off"
            value={text}
            onKeyDown={keys}
            onChange={(e) => setText(e.target.value)}
          />
        </>
      )}
      {error && (
        <div id={`${id}-err`} className="field-error" role="alert">
          {error}
        </div>
      )}
      <div className="rte-panel-actions">
        {onRemove && (
          <button type="button" className="btn btn--sm btn--ghost" onClick={onRemove}>
            {t('link.remove')}
          </button>
        )}
        <button type="button" className="btn btn--sm" onClick={onCancel}>
          {tc('actions.cancel')}
        </button>
        <button type="button" className="btn btn--sm btn--primary" onClick={submit}>
          {t('link.apply')}
        </button>
      </div>
    </PanelShell>
  );
}

function ImagePanel({ onInsert, onCancel }: { onInsert: (src: string, alt: string) => void; onCancel: () => void }) {
  const t = useT();
  const tc = useCommonT();
  const id = useId();
  const [url, setUrl] = useState('');
  const [alt, setAlt] = useState('');
  const [errors, setErrors] = useState<{ url?: string; alt?: string }>({});
  const submit = () => {
    const src = normalizeImageSrc(url);
    setErrors({ ...(src ? {} : { url: t('image.invalid') }), ...(alt.trim() ? {} : { alt: t('image.altRequired') }) });
    if (src && alt.trim()) onInsert(src, alt.trim());
  };
  const keys = panelKeys(submit, onCancel);
  return (
    <PanelShell title={t('image.title')}>
      <label className="rte-panel-label" htmlFor={`${id}-url`}>
        {t('image.url')}
      </label>
      <input
        id={`${id}-url`}
        className="input"
        // eslint-disable-next-line jsx-a11y/no-autofocus -- the panel opens on the user's request; focus belongs in it
        autoFocus
        inputMode="url"
        autoComplete="off"
        placeholder={t('image.urlPh')}
        value={url}
        aria-invalid={errors.url ? true : undefined}
        aria-describedby={errors.url ? `${id}-uerr` : undefined}
        onKeyDown={keys}
        onChange={(e) => setUrl(e.target.value)}
      />
      {errors.url && (
        <div id={`${id}-uerr`} className="field-error" role="alert">
          {errors.url}
        </div>
      )}
      <label className="rte-panel-label" htmlFor={`${id}-alt`}>
        {t('image.alt')}
      </label>
      <input
        id={`${id}-alt`}
        className="input"
        autoComplete="off"
        value={alt}
        aria-invalid={errors.alt ? true : undefined}
        aria-describedby={`${id}-ahint`}
        onKeyDown={keys}
        onChange={(e) => setAlt(e.target.value)}
      />
      <div id={`${id}-ahint`} className={errors.alt ? 'field-error' : 'field-hint'} role={errors.alt ? 'alert' : undefined}>
        {errors.alt ?? t('image.altHint')}
      </div>
      <div className="rte-panel-actions">
        <button type="button" className="btn btn--sm" onClick={onCancel}>
          {tc('actions.cancel')}
        </button>
        <button type="button" className="btn btn--sm btn--primary" onClick={submit}>
          {t('image.insert')}
        </button>
      </div>
    </PanelShell>
  );
}

/** Inline (non-modal) panel under the toolbar. Not a <form>: editors live inside other forms (nested forms are invalid). */
function PanelShell({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="rte-panel" role="group" aria-labelledby={id}>
      <div id={id} className="rte-panel-title">
        {title}
      </div>
      {children}
    </div>
  );
}
