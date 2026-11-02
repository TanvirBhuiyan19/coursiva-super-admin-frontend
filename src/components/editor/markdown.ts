// Markdown ⇄ editor conversion. Only the constructs the servers and the student site render are produced:
// `##`/`###` headings, paragraphs, `>` quotes, `-` and `1.` lists, `---`, `**bold**`, `*italic*`, `` `code` ``,
// `[links](…)` and `![images](https://…)`. Underscore emphasis is still read (older content used it).
import { $createHorizontalRuleNode, $isHorizontalRuleNode, HorizontalRuleNode } from '@lexical/extension';
import {
  BOLD_STAR,
  BOLD_UNDERSCORE,
  HEADING,
  INLINE_CODE,
  ITALIC_STAR,
  ITALIC_UNDERSCORE,
  LINK,
  ORDERED_LIST,
  QUOTE,
  UNORDERED_LIST,
  type ElementTransformer,
  type TextMatchTransformer,
  type Transformer,
} from '@lexical/markdown';
import type { LexicalNode } from 'lexical';
import { normalizeImageSrc, type EditorFeature } from './features';
import { $createImageNode, $isImageNode, ImageNode } from './ImageNode';

export const DIVIDER: ElementTransformer = {
  dependencies: [HorizontalRuleNode],
  export: (node: LexicalNode) => ($isHorizontalRuleNode(node) ? '---' : null),
  regExp: /^(---|\*\*\*|___)\s?$/,
  replace: (parent, _children, _match, isImport) => {
    const rule = $createHorizontalRuleNode();
    if (isImport || parent.getNextSibling() != null) parent.replace(rule);
    else parent.insertBefore(rule);
    rule.selectNext();
  },
  type: 'element',
};

export const IMAGE: TextMatchTransformer = {
  dependencies: [ImageNode],
  export: (node) => {
    if (!$isImageNode(node)) return null;
    // Brackets in alt text would end the image early; parentheses in the URL are percent-encoded.
    return `![${node.getAlt().replace(/[[\]]/g, '')}](${node.getSrc().replace(/\(/g, '%28').replace(/\)/g, '%29')})`;
  },
  importRegExp: /!\[([^\]]*)\]\(([^()\s]+)\)/,
  regExp: /!\[([^\]]*)\]\(([^()\s]+)\)$/,
  replace: (textNode, match) => {
    const src = normalizeImageSrc(match[2] ?? '');
    // Unsafe or non-https sources stay as plain text, never as a loaded image.
    if (src) textNode.replace($createImageNode(src, match[1] ?? ''));
  },
  trigger: ')',
  type: 'text-match',
};

/** Transformers for a field's features. Order matters: the first transformer for a format is used on export. */
export function transformersFor(features: readonly EditorFeature[]): Transformer[] {
  const on = (f: EditorFeature) => features.includes(f);
  return [
    ...(on('headings') ? [HEADING] : []),
    ...(on('quote') ? [QUOTE] : []),
    ...(on('lists') ? [UNORDERED_LIST, ORDERED_LIST] : []),
    ...(on('divider') ? [DIVIDER] : []),
    ...(on('code') ? [INLINE_CODE] : []),
    BOLD_STAR,
    ITALIC_STAR,
    BOLD_UNDERSCORE,
    ITALIC_UNDERSCORE,
    // The image transformer must run before LINK, whose pattern also matches `[alt](src)` inside `![alt](src)`.
    ...(on('image') ? [IMAGE] : []),
    ...(on('link') ? [LINK] : []),
  ];
}
