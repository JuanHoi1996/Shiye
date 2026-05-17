# Fonts

- `NotoSansSC-400.ttf` — Noto Sans SC (Regular), from [Google Fonts](https://fonts.google.com/noto/specimen/Noto+Sans+SC) / [Noto CJK](https://github.com/googlefonts/noto-cjk). Licensed under the SIL Open Font License 1.1.

Install path: served as static file at `/fonts/NotoSansSC-400.ttf` if you add the file locally.

**Chat PDF export** (`Navbar.tsx`): optional **jsPDF** embedding of `NotoSansSC-400.ttf` from this path for CJK; if the file is absent, export falls back to Helvetica (Latin only for PDF glyphs).
