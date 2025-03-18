
# DLSITE Game (&Stuff) Manager

Lite software manager for game downloaded from DLsite.com

## Features

- Game list
- Game launcher
- Data fetch
- Filtering by name, categories, genre
- Fetch metadata & image from DLsite
- Custom rating
- Purge cache & image cache (at start or dynamically)

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
