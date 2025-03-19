
# DLSITE Game (&Stuff) Manager

Lite software manager for game downloaded from DLsite.com

## Features

- Game list, data
- Game launcher
- Filter by name, author, categories, genres
- Fetch metadata & images from DLsite
- Custom rating
- Custom tag
- Playtime tracking
- Block play game button when playing
- Open dlsite webpage on default browser

## Roadmap

- time tracking
- Add custom tag
- open save files (unity, rpgmaker, godot)


### Implemented but not reliable
- File size checker (between local and fetch from DLSite)

## Dependencies

Builded with Electron.

```bash
  npm install electron --save-dev
  npm i electron-builder
```

Use dlsite-async to fetch metadata.
https://github.com/bhrevol/dlsite-async

```bash
  pip install dlsite-async
```
