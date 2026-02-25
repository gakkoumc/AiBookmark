# AiBookmark

AiBookmark is a Chrome extension that exports/imports bookmarks as YAML, so you can edit bookmark trees safely in your editor and sync changes back to the Bookmarks Bar.

## Features
- Export current Bookmarks Bar structure to YAML.
- Edit folder/url hierarchy in YAML.
- Import YAML with smart merge behavior to preserve existing bookmark IDs when possible.
- Remove orphaned nodes not present in imported YAML.

## Project status
This repository is prepared for OSS publication with MIT licensing and contribution/security guidelines.

## Installation (Developer mode)
1. Clone this repository.
2. Open `chrome://extensions/` in Chrome.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this repository directory.

> Note: Ensure your extension `manifest.json` is present in the loaded directory. (If your local workspace excludes it, add it before loading.)

## Usage
1. Open the AiBookmark popup.
2. Click **Export YAML** to dump current bookmarks to the editor.
3. Edit YAML.
4. Click **Import YAML** to apply updates.

## Privacy & data handling
- AiBookmark operates locally via Chrome Bookmarks API.
- It does not transmit bookmarks to external servers.

## Third-party dependency
- `js-yaml` (MIT License): <https://github.com/nodeca/js-yaml>

See [NOTICE](NOTICE.md) for bundled third-party notices.

## Contributing
Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

## Security
Please report vulnerabilities according to [SECURITY.md](SECURITY.md).

## License
This project is licensed under the MIT License. See [LICENSE](LICENSE).
