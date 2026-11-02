// What you see is what is stored. Lexical keeps whatever its registered nodes can hold (a pasted <h1>, a quote, a
// list, underline…), but a field only stores what its feature set's Markdown transformers export: anything else would
// show in the editor and silently vanish on save. These node transforms run inside every update (paste, drop, typing,
// Markdown import) and rewrite the document to exactly what the field stores:
//
// - headings: `##`/`###` only (h1 → h2, h4–h6 → h3); without 'headings' a heading becomes a plain paragraph (its
//   text is not bolded: a whole bold line would read as a different kind of emphasis than the author chose);
// - quotes, lists, links, dividers, images: unwrapped to paragraphs / plain text, or removed, when the feature is off;
//   check lists become bullet lists; links must pass `normalizeHref` (no javascript:, no #anchors) and lose titles;
// - text: only bold, italic and (with 'code') inline code survive — no underline, strikethrough, sub/superscript,
//   highlight, case, inline CSS; blocks lose alignment and indentation;
// - any other element or decorator node a dependency registers (e.g. pasted HTML we have no Markdown for) becomes
//   paragraphs of its content.
//
// Transforms only write when something changes (a write re-runs them), so a clean document is never touched.
import { HorizontalRuleNode } from '@lexical/extension';
import { AutoLinkNode, LinkNode } from '@lexical/link';
import { $isListNode, ListItemNode, ListNode } from '@lexical/list';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { $unwrapNode, mergeRegister } from '@lexical/utils';
import {
  $createParagraphNode,
  $createTextNode,
  $isDecoratorNode,
  $isElementNode,
  DecoratorNode,
  ElementNode,
  ParagraphNode,
  TextNode,
  type DOMConversionMap,
  type Klass,
  type LexicalEditor,
  type LexicalNode,
  type TextFormatType,
} from 'lexical';
import { normalizeHref, type EditorFeature } from './features';
import { ImageNode } from './ImageNode';

const FORMATS: readonly TextFormatType[] = [
  'bold',
  'italic',
  'code',
  'underline',
  'strikethrough',
  'subscript',
  'superscript',
  'highlight',
  'lowercase',
  'uppercase',
  'capitalize',
];

/** Node types the normaliser knows; any other registered node is flattened. */
const KNOWN = new Set([
  'root',
  'paragraph',
  'text',
  'linebreak',
  'tab',
  HeadingNode.getType(),
  QuoteNode.getType(),
  ListNode.getType(),
  ListItemNode.getType(),
  LinkNode.getType(),
  AutoLinkNode.getType(),
  HorizontalRuleNode.getType(),
  ImageNode.getType(),
]);

const isBlock = (node: LexicalNode) => ($isElementNode(node) || $isDecoratorNode(node)) && !node.isInline();

/** Replaces a block with paragraphs: runs of inline children become paragraphs, block children stay blocks. */
function $toParagraphs(node: ElementNode) {
  const children = node.getChildren();
  if (!children.some(isBlock)) {
    node.replace($createParagraphNode(), true);
    return;
  }
  let para: ParagraphNode | null = null;
  for (const child of children) {
    if (isBlock(child)) {
      node.insertBefore(child);
      para = null;
    } else {
      if (!para) {
        para = $createParagraphNode();
        node.insertBefore(para);
      }
      para.append(child);
    }
  }
  node.remove();
}

/** A list as paragraphs, one per item, nested lists flattened in order. */
function $listToParagraphs(list: ListNode) {
  const out: LexicalNode[] = [];
  const walk = (items: LexicalNode[]) => {
    for (const item of items) {
      if (!$isElementNode(item)) continue;
      const before = out.length;
      let para: ParagraphNode | null = null;
      for (const child of item.getChildren()) {
        if ($isListNode(child)) {
          walk(child.getChildren());
          para = null;
        } else if (isBlock(child)) {
          out.push(child);
          para = null;
        } else {
          if (!para) {
            para = $createParagraphNode();
            out.push(para);
          }
          para.append(child);
        }
      }
      // An empty item (often the one holding the caret) stays as an empty paragraph.
      if (out.length === before) out.push($createParagraphNode());
    }
  };
  walk(list.getChildren());
  for (const node of out) list.insertBefore(node);
  list.remove();
}

/** Alignment and indentation have no Markdown. */
function $plainBlock(node: ElementNode) {
  if (node.getFormatType() !== '') node.setFormat('');
  if (node.getIndent() !== 0) node.setIndent(0);
}

/**
 * Paste import overrides. A code block (`<pre><code>`) arrives as plain lines: there are no code blocks, inline code
 * is for short spans (and Lexical would format only part of the block).
 */
export const HTML_IMPORT: DOMConversionMap = {
  code: (el) => (el.closest('pre') ? { conversion: () => ({ node: null }), priority: 1 } : null),
};

/** Keeps the document to what `features` store. Returns the cleanup. */
export function registerNormalize(editor: LexicalEditor, features: readonly EditorFeature[]): () => void {
  const on = (f: EditorFeature) => features.includes(f);
  const keep = new Set<TextFormatType>(['bold', 'italic', ...(on('code') ? (['code'] as const) : [])]);

  const $link = (node: LinkNode) => {
    const href = on('link') ? normalizeHref(node.getURL()) : null;
    if (!href) {
      $unwrapNode(node);
      return;
    }
    if (href !== node.getURL()) node.setURL(href);
    if (node.getTitle()) node.setTitle(null);
  };

  const removals: Array<() => void> = [
    editor.registerNodeTransform(TextNode, (node) => {
      for (const f of FORMATS) if (!keep.has(f) && node.hasFormat(f)) node.toggleFormat(f);
      if (node.getStyle() !== '') node.setStyle('');
    }),
    editor.registerNodeTransform(ParagraphNode, $plainBlock),
    editor.registerNodeTransform(HeadingNode, (node) => {
      if (!on('headings')) {
        $toParagraphs(node);
        return;
      }
      $plainBlock(node);
      const tag = node.getTag();
      if (tag === 'h1') node.setTag('h2');
      else if (tag !== 'h2' && tag !== 'h3') node.setTag('h3');
    }),
    editor.registerNodeTransform(QuoteNode, (node) => {
      if (on('quote')) $plainBlock(node);
      else $toParagraphs(node);
    }),
    editor.registerNodeTransform(ListNode, (node) => {
      if (!on('lists')) $listToParagraphs(node);
      else if (node.getListType() === 'check') node.setListType('bullet');
    }),
    editor.registerNodeTransform(ListItemNode, (node) => {
      if (node.getChecked() !== undefined) node.setChecked(undefined);
      if (node.getFormatType() !== '') node.setFormat('');
    }),
    editor.registerNodeTransform(LinkNode, $link),
    editor.registerNodeTransform(AutoLinkNode, $link),
    editor.registerNodeTransform(HorizontalRuleNode, (node) => {
      if (!on('divider')) node.remove();
    }),
    editor.registerNodeTransform(ImageNode, (node) => {
      if (!on('image')) node.remove();
    }),
  ];

  // Nodes some dependency registers that we have no Markdown for: flattened to what they contain.
  for (const { klass } of editor._nodes.values()) {
    const type = klass.getType();
    if (KNOWN.has(type)) continue;
    const proto = klass.prototype as unknown;
    if (proto instanceof ElementNode)
      removals.push(
        editor.registerNodeTransform(klass as Klass<ElementNode>, (node) => {
          if (node.isInline()) $unwrapNode(node);
          else $toParagraphs(node);
        }),
      );
    else if (proto instanceof DecoratorNode)
      removals.push(
        editor.registerNodeTransform(klass as Klass<DecoratorNode<unknown>>, (node) => {
          const text = node.getTextContent();
          if (text && node.isInline()) node.replace($createTextNode(text));
          else node.remove();
        }),
      );
  }

  return mergeRegister(...removals);
}
