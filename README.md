<img align=center src="https://i.postimg.cc/J0J2Xp6Q/icon.png"  width="120"  alt="Marquedown icon">
<h1>Marquedown</h1>

A lightweight Markdown editor with live preview & syntax highlighting, built with Electron.

Marquedown simplifies and pairs the [Editor.md](https://github.com/pandao/editor.md) editor with a shell and adds enhancements and extra functionality.

<img  src="https://i.postimg.cc/FKL3Nw7H/marquedown.png"  width="720">

## Download

I'm currently only shipping a distro-agnostic **AppImage**, at least for the time-being. Feel free to build from source.
Check out the **[Releases](https://github.com/itheus/marquedown/releases)** page.

### To run the App:
Use [Gear Lever](https://github.com/mijorus/gearlever "Gear Lever") to integrate the appimage on your system.

or manually run by:
```bash
chmod +x Marquedown-1.0.0.AppImage
./Marquedown-1.0.0.AppImage
```

## Features

- **Live preview** with synchronized scrolling
- **GitHub-flavored Markdown**s
- **Syntax highlighting**
- **Search & replace**
- **Switch between Light and dark themes in realtime**
- **Native file handling**

## Keyboard shortcuts

| Action           | Shortcut                 |
| :--------------- | :----------------------- |
| Bold             | `Ctrl` / `Cmd` + `B`     |
| Italic           | `Ctrl` / `Cmd` + `I`     |
| Link             | `Ctrl` / `Cmd` + `L`     |
| New document     | `Ctrl` / `Cmd` + `N`     |
| Open…            | `Ctrl` / `Cmd` + `O`     |
| Save             | `Ctrl` / `Cmd` + `S`     |
| Save As…         | `Ctrl` / `Cmd` + `Shift` + `S` |
| Toggle dark theme| `Ctrl` / `Cmd` + `Shift` + `D` |


## Third-party

Marquedown bundles Editor.md, jQuery, CodeMirror, and marked. Each keeps its own license and copyright. All icons are rendered from inline SVG masks.
