# Third-party notices

## Material Icon Theme

The bundled file icons come from
[Material Icon Theme](https://github.com/material-extensions/vscode-material-icon-theme)
(`material-icon-theme`, MIT).

```
The MIT License (MIT)
Copyright (c) 2025 Material Extensions

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## Lucide

The sidebar project folder icons come from [Lucide](https://lucide.dev)
(`lucide-react`, ISC).

```
ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

---

The following Lucide icons are derived from the Feather project:

airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out

The MIT License (MIT) (for the icons listed above)

Copyright (c) 2013-present Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## TypeScript server

Go to definition ships [TypeScript](https://github.com/microsoft/TypeScript)
6.0.3's tsserver (`typescript`, Apache-2.0) and
[typescript-language-server](https://github.com/typescript-language-server/typescript-language-server)
6.1.0 (Apache-2.0) in `Resources/typescriptServer`, each with its own license
file (TypeScript also with its `ThirdPartyNoticeText.txt`).

## Tree-sitter grammars and queries

Go to definition (`docs/goToDefinition.md`) bundles these grammars under
`resources/treeSitter/`, all MIT. The `.wasm` files are the grammars' release
assets, except Vue, which no release ships: it was built with
`tree-sitter build --wasm` (tree-sitter CLI 0.26.13) at the listed commit. The
queries under `resources/treeSitter/queries/` are derived from the grammars'
`queries/tags.scm` at the same versions, and the Perl one from
[rgctl](https://github.com/rgctl/rgctl)'s
`crates/rgctl-lang-perl/queries/tags.scm`.

| File                          | Source                                                                                          | Version  | Copyright                    |
| ----------------------------- | ----------------------------------------------------------------------------------------------- | -------- | ---------------------------- |
| `tree-sitter-typescript.wasm` | [tree-sitter/tree-sitter-typescript](https://github.com/tree-sitter/tree-sitter-typescript)     | v0.23.2  | 2017 Max Brunsfeld           |
| `tree-sitter-tsx.wasm`        | [tree-sitter/tree-sitter-typescript](https://github.com/tree-sitter/tree-sitter-typescript)     | v0.23.2  | 2017 Max Brunsfeld           |
| `tree-sitter-javascript.wasm` | [tree-sitter/tree-sitter-javascript](https://github.com/tree-sitter/tree-sitter-javascript)     | v0.25.0  | 2014 Max Brunsfeld           |
| `tree-sitter-python.wasm`     | [tree-sitter/tree-sitter-python](https://github.com/tree-sitter/tree-sitter-python)             | v0.25.0  | 2016 Max Brunsfeld           |
| `tree-sitter-go.wasm`         | [tree-sitter/tree-sitter-go](https://github.com/tree-sitter/tree-sitter-go)                     | v0.25.0  | 2014 Max Brunsfeld           |
| `tree-sitter-rust.wasm`       | [tree-sitter/tree-sitter-rust](https://github.com/tree-sitter/tree-sitter-rust)                 | v0.24.2  | 2017 Maxim Sokolov           |
| `tree-sitter-java.wasm`       | [tree-sitter/tree-sitter-java](https://github.com/tree-sitter/tree-sitter-java)                 | v0.23.5  | 2017 Ayman Nadeem            |
| `tree-sitter-perl.wasm`       | [tree-sitter-perl/tree-sitter-perl](https://github.com/tree-sitter-perl/tree-sitter-perl)       | v2.0.6   | 2025 Avishai "Veesh" Goldman |
| `tree-sitter-vue.wasm`        | [tree-sitter-grammars/tree-sitter-vue](https://github.com/tree-sitter-grammars/tree-sitter-vue) | ce8011a4 | 2024 Amaan Qureshi           |
| `queries/perl.scm`            | [rgctl/rgctl](https://github.com/rgctl/rgctl)                                                   | main     | 2026 rgctl Contributors      |

Each is distributed under the MIT License:

```
Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```
