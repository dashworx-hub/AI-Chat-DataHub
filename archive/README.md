# Archive

This folder contains files and folders that are not used by the running application. They were moved here to keep the project root clean. The app uses Backend/ and Frontend/ only.

## Contents (moved here)

- **src/** – Duplicate of `Frontend/src/`. The app runs from Frontend.
- **public/** – Duplicate of `Frontend/public/`. Vite serves from `Frontend/public/`.
- **main.py** – Duplicate of `Backend/main.py`. The backend runs from Backend.
- **package.json**, **package-lock.json** – Duplicate of Frontend npm setup.
- **vite.config.js**, **tailwind.config.js**, **postcss.config.js** – Duplicate of Frontend config files.
- **ca_profiles.json**, **agent_labels.json** – Duplicate of `Backend/ca_profiles.json` and `Backend/agent_labels.json`. The backend reads only from the Backend folder.

## Not in this folder (still in use)

- **index.html** (in project root) – The backend serves it as the first option for the UI (Backend/main.py root route). Do not move it here.
- **CA_API.json** – Referenced in .env as GOOGLE_APPLICATION_CREDENTIALS=CA_API.json. The backend resolves this from project root (or Backend/). It is kept in the project root so the app can find the credentials; it is not in this folder.

No files or folders were deleted; they were only moved here.
