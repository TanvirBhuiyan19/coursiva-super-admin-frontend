// An inline Markdown image (`![alt](https://…)`). Rendered as a plain <img>: the editor never loads anything but
// https sources (normalizeImageSrc) and the stored Markdown is what the site renders.
import { DecoratorNode, type LexicalNode, type NodeKey, type SerializedLexicalNode, type Spread } from 'lexical';
import type { JSX } from 'react';

type SerializedImageNode = Spread<{ src: string; alt: string }, SerializedLexicalNode>;

export class ImageNode extends DecoratorNode<JSX.Element> {
  __src: string;
  __alt: string;

  static override getType() {
    return 'md-image';
  }

  static override clone(node: ImageNode) {
    return new ImageNode(node.__src, node.__alt, node.__key);
  }

  static override importJSON(json: SerializedImageNode) {
    return $createImageNode(json.src, json.alt);
  }

  constructor(src: string, alt: string, key?: NodeKey) {
    super(key);
    this.__src = src;
    this.__alt = alt;
  }

  override exportJSON(): SerializedImageNode {
    return { ...super.exportJSON(), type: 'md-image', version: 1, src: this.__src, alt: this.__alt };
  }

  override createDOM() {
    const span = document.createElement('span');
    span.className = 'rte-img';
    return span;
  }

  override updateDOM() {
    return false;
  }

  override isInline() {
    return true;
  }

  getSrc() {
    return this.getLatest().__src;
  }

  getAlt() {
    return this.getLatest().__alt;
  }

  override decorate() {
    return <img src={this.__src} alt={this.__alt} loading="lazy" referrerPolicy="no-referrer" draggable={false} />;
  }
}

export const $createImageNode = (src: string, alt: string) => new ImageNode(src, alt);
export const $isImageNode = (node: LexicalNode | null | undefined): node is ImageNode => node instanceof ImageNode;
