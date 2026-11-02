export const loadEditor = () => import('./Editor');
/** Fetch the editor's code ahead of time (e.g. when a drawer that contains one is about to open). */
export const preloadRichTextEditor = () => void loadEditor();
