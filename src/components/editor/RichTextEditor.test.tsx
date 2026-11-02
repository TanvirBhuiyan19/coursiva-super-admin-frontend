import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Field } from '@/components/ui';
import { $isHeadingNode } from '@lexical/rich-text';
import { $getRoot, $isElementNode, $isTextNode, type LexicalEditor, type LexicalNode, type TextFormatType } from 'lexical';
import { normalizeHref, normalizeImageSrc, type EditorFeature } from './features';
import { BASIC, FULL, RichTextEditor, STANDARD } from './index';

const FORMATS: TextFormatType[] = ['bold', 'italic', 'code', 'underline', 'strikethrough', 'subscript', 'superscript', 'highlight'];

function Harness({ initial = '', onValue }: { initial?: string; onValue?: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <Field label="Body">
        {(p) => (
          <RichTextEditor
            {...p}
            features={FULL}
            value={value}
            maxLength={500}
            onChange={(v) => {
              setValue(v);
              onValue?.(v);
            }}
          />
        )}
      </Field>
      <button type="button" onClick={() => setValue('# Reset\n\nFrom outside')}>
        reset
      </button>
      <output data-testid="md">{value}</output>
    </>
  );
}

const md = () => screen.getByTestId('md').textContent;

describe('RichTextEditor', () => {
  it('renders Markdown as formatted text, labelled by its field', async () => {
    render(<Harness initial={'## Welcome\n\nSome **bold** and *italic* with a [link](https://example.com).\n\n- one\n- two'} />);
    const box = await screen.findByRole('textbox', { name: 'Body' });
    expect(box.querySelector('h2')?.textContent).toBe('Welcome');
    expect(box.querySelector('strong, .rte-b')?.textContent).toBe('bold');
    expect(box.querySelector('a')?.getAttribute('href')).toBe('https://example.com');
    expect(box.querySelectorAll('li')).toHaveLength(2);
    expect(screen.getByRole('toolbar', { name: 'Formatting' })).toBeInTheDocument();
  });

  it('emits Markdown as the author types and formats', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    const box = await screen.findByRole('textbox', { name: 'Body' });
    await user.click(box);
    await user.paste('Hello world');
    await waitFor(() => expect(md()).toBe('Hello world'));
    await user.keyboard('{Control>}a{/Control}');
    await user.click(screen.getByRole('button', { name: 'Bold' }));
    await waitFor(() => expect(md()).toBe('**Hello world**'));
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('loads a new value from outside without echoing it back', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Harness initial="Old" onValue={onValue} />);
    const box = await screen.findByRole('textbox', { name: 'Body' });
    await user.click(screen.getByRole('button', { name: 'reset' }));
    // Legacy `#` headings show as the `##` the editor stores (only `##`/`###` exist).
    await waitFor(() => expect(box.querySelector('h2')?.textContent).toBe('Reset'));
    expect(box.querySelector('h1')).toBeNull();
    expect(onValue).not.toHaveBeenCalled();
  });

  it('edits the Markdown source directly', async () => {
    const user = userEvent.setup();
    render(<Harness initial="Plain" />);
    await screen.findByRole('textbox', { name: 'Body' });
    await user.click(screen.getByRole('button', { name: 'Markdown source' }));
    const source = screen.getByLabelText('Body');
    expect(source.tagName).toBe('TEXTAREA');
    await user.clear(source);
    await user.type(source, '## Title');
    expect(md()).toBe('## Title');
    await user.click(screen.getByRole('button', { name: 'Markdown source' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Body' }).querySelector('h2')?.textContent).toBe('Title'));
  });

  it('inserts a link from the link panel and refuses unsafe addresses', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const box = await screen.findByRole('textbox', { name: 'Body' });
    await user.click(box);
    await user.click(screen.getByRole('button', { name: 'Link' }));
    await user.type(screen.getByLabelText('Link address'), 'javascript:alert(1)');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/web address/);
    await user.clear(screen.getByLabelText('Link address'));
    await user.type(screen.getByLabelText('Link address'), 'example.com/docs');
    await user.type(screen.getByLabelText('Text to show'), 'the docs');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(md()).toBe('[the docs](https://example.com/docs)'));
  });

  it('shows a character counter', async () => {
    render(<Harness initial={'x'.repeat(510)} />);
    await screen.findByRole('textbox', { name: 'Body' });
    expect(screen.getByText('10 characters over the limit')).toBeInTheDocument();
  });
});

describe('editor URL rules', () => {
  it('accepts web, email and site links, upgrades bare domains, refuses scripts', () => {
    expect(normalizeHref('https://a.com/x')).toBe('https://a.com/x');
    expect(normalizeHref('mailto:a@b.com')).toBe('mailto:a@b.com');
    expect(normalizeHref('/courses')).toBe('/courses');
    expect(normalizeHref('a.com/x')).toBe('https://a.com/x');
    expect(normalizeHref('javascript:alert(1)')).toBeNull();
    expect(normalizeHref('//evil.com')).toBeNull();
    expect(normalizeHref('data:text/html,x')).toBeNull();
    expect(normalizeImageSrc('http://a.com/i.png')).toBeNull();
    expect(normalizeImageSrc('https://a.com/i.png')).toBe('https://a.com/i.png');
  });
});

// Pasted HTML must end up as exactly what the field stores: the editor shows only storable formatting, and the
// Markdown it emits loads back into the same document ("save, then reload").
describe('RichTextEditor paste normalisation', () => {
  const HTML = [
    '<h1>Title</h1><h2>Sub</h2><h4>Deep</h4>',
    '<p style="text-align:center">Some <u>under</u> <s>strike</s> <sup>sup</sup> <mark>hi</mark> <b>bold</b> <i>it</i>',
    ' <span style="color:red">red</span> <code>tick</code> <a href="https://x.com" title="t">link</a>',
    ' <a href="javascript:alert(1)">bad</a> <a href="example.com/p">bare</a></p>',
    '<blockquote>Quoted</blockquote><pre><code>line one\nline two</code></pre>',
    '<table><tr><td>a</td><td>b</td></tr></table><img src="https://x.com/i.png" alt="pic"><hr>',
    '<ul><li>one</li><li>two<ul><li>nested</li></ul></li></ul><ol><li>first</li></ol>',
  ].join('');

  function Pasted({ features, onValue }: { features: readonly EditorFeature[]; onValue: (v: string) => void }) {
    const [value, setValue] = useState('');
    return (
      <RichTextEditor
        aria-label="Pasted"
        features={features}
        value={value}
        onChange={(v) => {
          setValue(v);
          onValue(v);
        }}
      />
    );
  }

  async function pasteHtml(box: HTMLElement, html: string) {
    await userEvent.setup().click(box);
    const data: Record<string, string> = { 'text/html': html, 'text/plain': 'plain' };
    const clipboardData = { types: Object.keys(data), files: [], items: [], getData: (t: string) => data[t] ?? '' };
    act(() => {
      box.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: clipboardData as unknown as DataTransfer, bubbles: true, cancelable: true }),
      );
    });
  }

  /** Every node type and text/block format in the editor's document. */
  function contents(box: HTMLElement) {
    const editor = (box as HTMLElement & { __lexicalEditor: LexicalEditor }).__lexicalEditor;
    const types = new Set<string>();
    const formats = new Set<string>();
    editor.getEditorState().read(() => {
      const walk = (node: LexicalNode) => {
        types.add($isHeadingNode(node) ? `heading-${node.getTag()}` : node.getType());
        if ($isTextNode(node)) {
          for (const f of FORMATS) if (node.hasFormat(f)) formats.add(f);
          if (node.getStyle()) formats.add('style');
        }
        if ($isElementNode(node)) {
          if (node.getFormatType()) formats.add(`align-${node.getFormatType()}`);
          node.getChildren().forEach(walk);
        }
      };
      $getRoot().getChildren().forEach(walk);
    });
    return { types: [...types].sort(), formats: [...formats].sort() };
  }

  async function pasteAndReload(features: readonly EditorFeature[]) {
    const onValue = vi.fn();
    const first = render(<Pasted features={features} onValue={onValue} />);
    const box = await screen.findByRole('textbox', { name: 'Pasted' });
    await pasteHtml(box, HTML);
    await waitFor(() => expect(onValue).toHaveBeenCalled());
    const markdown = onValue.mock.lastCall![0] as string;
    const shown = { html: box.innerHTML, ...contents(box) };
    first.unmount();
    // Reload: a fresh editor from the saved Markdown shows exactly what the author saw before saving.
    render(<RichTextEditor aria-label="Reloaded" features={features} value={markdown} onChange={() => undefined} />);
    const reloaded = await screen.findByRole('textbox', { name: 'Reloaded' });
    await waitFor(() => expect(reloaded.innerHTML).toBe(shown.html));
    expect(contents(reloaded)).toEqual({ types: shown.types, formats: shown.formats });
    return { markdown, ...shown };
  }

  it('keeps a BASIC field to emphasis, lists and safe links', async () => {
    const { markdown, types, formats } = await pasteAndReload(BASIC);
    expect(types).toEqual(['linebreak', 'link', 'list', 'listitem', 'paragraph', 'text']);
    expect(formats).toEqual(['bold', 'italic']);
    expect(markdown).not.toMatch(/^#|^>|`|---|!\[|javascript/m);
    expect(markdown).toContain('Title\n\nSub\n\nDeep\n\nSome under strike sup hi **bold** *it* red tick ');
    expect(markdown).toContain('[link](https://x.com) bad [bare](https://example.com/p)');
    expect(markdown).toContain('Quoted\n\nline one\nline two\n\na\n\nb');
    expect(markdown).toContain('- one\n- two\n    - nested\n\n1. first');
  });

  it('keeps a STANDARD field to ## and ### headings, quotes, lists and links', async () => {
    const { markdown, types, formats, html } = await pasteAndReload(STANDARD);
    expect(types).toEqual(['heading-h2', 'heading-h3', 'linebreak', 'link', 'list', 'listitem', 'paragraph', 'quote', 'text']);
    expect(formats).toEqual(['bold', 'italic']);
    expect(html).not.toMatch(/<(h1|h4|code|hr|img|u|s|table)\b/);
    expect(markdown).toMatch(/^## Title\n\n## Sub\n\n### Deep\n\nSome under strike sup hi \*\*bold\*\* \*it\* red tick /);
    expect(markdown).toContain('\n\n> Quoted\n\nline one\nline two\n\n');
    expect(markdown).not.toMatch(/`|---|javascript/);
  });

  it('keeps inline code and dividers in a FULL field, never a code block', async () => {
    const { markdown, formats } = await pasteAndReload(FULL);
    expect(formats).toEqual(['bold', 'code', 'italic']);
    expect(markdown).toContain('red `tick` [link](https://x.com)');
    expect(markdown).toContain('> Quoted\n\nline one\nline two\n\n');
    expect(markdown).toContain('\n\n---\n\n');
  });

  it('turns links and lists into plain text where the field has neither', async () => {
    const { markdown, types } = await pasteAndReload(['headings']);
    expect(types).toEqual(['heading-h2', 'heading-h3', 'linebreak', 'paragraph', 'text']);
    expect(markdown).toContain('red tick link bad bare');
    expect(markdown).toContain('one\n\ntwo\n\nnested\n\nfirst');
  });
});
