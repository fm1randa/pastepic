// PastePic — shared limits.
// Loaded in the ISOLATED world (before content.js) and in the service worker.
// Single source of truth: the response guard is DERIVED from the worst case of
// the automatic chain, so adding a provider cannot silently outgrow the guard.

globalThis.PastePicLimits = {
  autoOrder: ['catbox', 'pomf', 'uguu', 'litterbox', 'tmpfiles'],
  uploadTimeoutMs: 60000,
  // Extra room for the Imgur hop in front of the chain and for slow bodies.
  guardSlackMs: 15000,
  // Shells whose paste target may not itself be the editable element (ByteMD
  // renders a span inside the editor). Shared so the isolated world can claim
  // the paste without naming any editor API.
  editorShells: '.bytemd, .CodeMirror, .cm-editor, .cm-content, .ProseMirror, .monaco-editor',
};
