Ghostscript compiled to WebAssembly — @jspawn/ghostscript-wasm 0.0.2 (unmodified)
Source: https://github.com/jsscheller/ghostscript-wasm · Ghostscript source: https://www.ghostscript.com / https://github.com/ArtifexSoftware/ghostpdl
License: AGPL-3.0 (see LICENSE.txt). Used by the ERP design-file splitter (lib/eps-convert.ts) to turn .eps/.ps into PDF in the browser.
Loaded on demand only when a user drops an .eps file — never bundled by webpack (heavy libs live in public/vendor).
