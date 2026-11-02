// Rich text editor: toolbar, link/image dialogs and the Markdown source view. Ships in the editor's lazy chunk.
import { defineMessages } from '@/lib/i18n';

export const { t, useT, source } = defineMessages('editor', {
  toolbar: 'Formatting',
  tools: {
    undo: 'Undo',
    redo: 'Redo',
    paragraph: 'Normal text',
    h2: 'Heading',
    h3: 'Subheading',
    bold: 'Bold',
    italic: 'Italic',
    code: 'Inline code',
    link: 'Link',
    bullet: 'Bulleted list',
    number: 'Numbered list',
    quote: 'Quote',
    divider: 'Divider',
    image: 'Image',
    source: 'Markdown source',
  },
  /** Letters on the toolbar buttons (localise like a word processor would: e.g. German F/K for bold/italic). */
  glyphs: { bold: 'B', italic: 'I', h2: 'H2', h3: 'H3', redo: 'Y', redoMac: '⇧Z' },
  /** Keyboard shortcut hints appended to tooltips; {key} is Ctrl or ⌘. */
  shortcut: '{name} ({key}+{letter})',
  blockType: 'Text style',
  link: {
    title: 'Link',
    url: 'Link address',
    urlPh: 'https://example.com',
    text: 'Text to show',
    apply: 'Apply',
    remove: 'Remove link',
    invalid: 'Use a web address (https://…), an email link (mailto:…) or a path on your site (/…).',
  },
  image: {
    title: 'Insert image',
    url: 'Image address',
    urlPh: 'https://example.com/photo.jpg',
    alt: 'Alt text',
    altHint: 'Describes the image for people using screen readers.',
    insert: 'Insert',
    invalid: 'Use an https:// image address.',
    altRequired: 'Describe the image so everyone can follow along.',
  },
  sourceLabel: '{label} (Markdown)',
  sourceHint: 'Editing the Markdown directly. Switch the source view off to return to the visual editor.',
  counter: '{count} / {max}',
  over: { one: '{count} character over the limit', other: '{count} characters over the limit' },
  loading: 'Loading editor',
});
