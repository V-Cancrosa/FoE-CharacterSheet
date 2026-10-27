# Map & Scene Browser (Foundry VTT v14 module)

A GM-only window that lists map and scene modules from a remote CSV file: search by name, filter by type
(All / Scene / Map), and Install / Uninstall buttons on each card. This module is separate from the
Fallout: Equestria system in this repository; the system release doesn't include it.

## Install the module
Copy this folder to `Data/modules/map-scene-browser/` on the Foundry server (the folder name must match the `id`
in `module.json`), restart Foundry, and enable **Map & Scene Browser** in *Manage Modules*.

## Use it
1. *Configure Settings → Map & Scene Browser → CSV source URL*: paste a public link to the CSV.
2. Open the browser with the map icon in the **Token** controls on the left (GMs only), or from a macro:
   `game.modules.get("map-scene-browser").api.open()`.

CSV columns (header row required, any order): `source` (Scene, Map, …), `name`, `json_link` (module manifest URL),
`zip_link`, `version`. Only `name` and `json_link` are required; `zip_link` isn't used.

The browser downloads the CSV and the manifests itself, so their host has to allow cross-origin requests (CORS):
raw.githubusercontent.com, a Google Sheets "Publish to web" CSV link, and Dropbox links work. Dropbox links are read
through `dl.dropboxusercontent.com`.

## Install and Uninstall
Foundry v14 has no API for installing or removing packages from inside a running world. The buttons send the same
request that the Setup screen sends (`POST /setup` with `installPackage` / `uninstallPackage`). If the server refuses it,
for example because a world is running or because this browser isn't logged in as the server administrator, the
module shows the reason. Install also copies the manifest URL, so you can paste it into *Setup → Add-on Modules →
Install Module*.

- **Install** reads the module ID from the manifest (to show the status), asks first if the module is already installed,
  then sends the install request. A newly installed module shows up in *Manage Modules* after the world reloads.
- **Uninstall** finds the module ID (from an installed module with the same manifest URL, or from the manifest),
  checks that the module is installed and not enabled in this world, asks for confirmation, then sends the uninstall request.
- The status line shows the installed version, whether the CSV has a newer one, and whether the module is enabled.
