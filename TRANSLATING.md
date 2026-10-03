# Translating DLSGM

DLSGM is available in French, English and Japanese. You can add another language by filling in **a single file**. No programming is needed.

Translations are the one kind of contribution merged **as is**. For everything else, DLSGM works with *prompt requests* (see the [contributing guide](CONTRIBUTING.md)): code sent in a pull request is read as a description and is not merged directly. A translation file is different: it is checked, then added to the app unchanged.

## How it works

Each language has one file in the [`locales/`](locales) folder, named after its language code: `en.json` (English), `ja.json` (Japanese), and for example `de.json` (German) or `pt-BR.json` (Brazilian Portuguese).

French is the original language of the app. **Each French text is used as the key of its translation**:

```json
{
  "language": {
    "name": "Deutsch",
    "locale": "de-DE"
  },
  "ui": {
    "Paramètres": "Einstellungen",
    "{n} œuvres": "{n} Werke",
    "Langue du système": ""
  },
  "main": {
    "Quitter": "Beenden"
  }
}
```

- **`language`**
  - **`name`** is the name of your language, written in your language. It appears in Settings › Display › Interface language.
  - **`locale`** sets how dates and numbers are written (for example `de-DE`, `es-ES` or `pt-BR`).
- **`ui`** holds the texts of the app's windows.
- **`main`** holds pop-up dialogs, the notification area menu and error messages.
  - Some French texts appear in both sections. Translate them in both places. They can be translated differently if the context calls for it (for example a short button label in the settings and a longer one in a pop-up).
- **An empty text (`""`) is shown in English.** A partial translation is fine: the app shows what is translated and uses English for the rest. You don't need to translate everything at once.

As soon as the file is in the `locales/` folder, the language appears in the settings. With "System language" selected, the app also opens in that language on computers set up for it.

## 1. Get the file to fill in

**With Node.js installed** (recommended): download or clone the project, open a terminal in its folder and run:

```bash
npm run i18n:template de
```

Replace `de` with your language code. This creates `locales/de.json` with every text of the app (about 1,100, sorted alphabetically) and an empty translation for each. If the file already exists, the command keeps your translations and adds the new texts only. You don't need `npm install` for this command.

**Without Node.js:**

1. Download [`locales/en.json`](locales/en.json).
2. Save it as `<your code>.json`.
3. Change the `language` block.
4. Replace the English texts with yours. Leave the texts on the left (the French keys) unchanged. Lines you don't translate yet can keep their English text, or be emptied with `""`.

**Not sure?** Open an [issue](https://github.com/Matty-H/DLSGM/issues) that names the language you want to translate, and we'll send you a ready-made file.

**Language code:** use the two-letter code of your language (`de`, `es`, `it`, `ko`). Add a region or script only if your language needs one, for example `pt-BR`, `zh-Hans` or `zh-Hant`. `fr` doesn't exist, because French is the source.

## 2. Translate

Change only the text **on the right** of each line:

```json
"Impossible de lancer le jeu : {error}": "Spiel konnte nicht gestartet werden: {error}"
```

Rules:

- **Never change the French text on the left.** It is how the app finds your translation. If you change it, the translation is ignored and the tests reject the file.
- **Keep every `{placeholder}` exactly as written**, for example `{n}`, `{name}`, `{hotkey}` or `{error}`. The app replaces them with a number, a name or a key. Move them wherever your grammar needs them, but don't translate, rename or remove them.
- **Keyboard keys:** copy them from the English translation (`Alt+Space`, `Shift+Tab`, `Ctrl+F8`, `F6`, `Esc`). If keyboards in your language label a key differently, you may use that label instead, for example `Strg` for `Ctrl` in German. The French text does the same with `Maj` for Shift.
- **Don't translate:**
  - names: DLSGM, DLsite, Windows, Sandboxie-Plus, Textractor, Locale Emulator, BepInEx, XUnity.AutoTranslator, RPG Maker, Unity, Private Internet Access (PIA), DeepL, Google, Ollama, LM Studio, Wikipedia
  - game IDs (`RJ123456`), file names and file extensions
  - folder names shown in paths (`Work`, `captures`, `save_backups`)
- **Menu paths:** in texts like `Settings › In-game tools`, use your own translations of those menus, so the user finds what the text describes.
- **Quotes inside a text:** write them as `\"`, or use your language's typographic quotes (“ ”, « », „ “, 「 」), as the existing translations do.
- **Tone:** short and friendly, like the English version. If your language has a formal and an informal "you", pick one and use it everywhere.
- **Length:** many texts are buttons or labels in narrow spaces. Keep translations about as short as the English.

**Tip:** `en.json` and your file list the same keys in the same order. Opening them side by side helps when the French is unclear.

## 3. Check your work

1. **The file must be valid JSON.** A missing comma or quote breaks the whole file. Most editors (VS Code, Notepad++ with a JSON plugin) or an online JSON validator will point out the error.
2. **Run `npm run i18n:template <code>` again.** It shows how much is translated and lists any translation whose `{placeholders}` don't match the French text.
3. **Run the tests** (needs `npm install` once): `npm test`. These are the checks run on every contribution. They verify that:
   - the file is valid
   - every French key still exists in the app
   - placeholders match
4. **See it in the app** (optional):
   1. Run `npm install`, then `npm start`.
   2. Choose your language in Settings › Display › Interface language.
   3. Look for texts that are cut off or don't fit.

## 4. Send your translation

Either:

- open a **pull request** that adds or updates `locales/<code>.json`, or
- open an **[issue](https://github.com/Matty-H/DLSGM/issues)** titled "Translation: <language>" with your file attached. If GitHub refuses the `.json` file, zip it or rename it to `.txt`.

A partial translation is welcome too. Say in the description what is left to do.

## Keeping a translation up to date

The app's texts change over time. Run `npm run i18n:template <code>` again:

- New texts are added empty and shown in English until they are translated.
- Texts the app no longer uses are moved to an `"obsolete"` block at the end of the file, which the app ignores. Often a sentence was only reworded: reuse your old translation for its new version, then delete the `"obsolete"` block.
