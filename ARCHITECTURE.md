# YumeShelf Architecture Map

YumeShelf is a minimalist game library launcher built with **Electron**. It follows a clear separation between the Main process (system logic) and the Renderer process (UI).

## Process Architecture

### 1. Main Process (`src/main.js`)
The main process acts as the backend and handles all OS-level interactions, filesystem operations, and service initialization.

*   **Responsibility**: Manages the application lifecycle, IPC registration, filesystem state, game scanning, and update services.
*   **Key Services**:
    *   `libraryState`: Manages JSON-based game database (loading/saving).
    *   `appUpdateServices`: Handles application updates and version checks.
    *   `iconPipeline`: Manages extraction and caching of game icons.
    *   `playtimeSessionManager`: Tracks game playtime.
    *   `startupServices`: Orchestrates the initialization sequence.

### 2. Renderer Process (`src/renderer.js`)
The renderer process handles the UI, user interactions, and translation engine.

*   **Responsibility**: Renders the game grid, handles user inputs, displays notifications, and applies themes/i18n.
*   **Key Components**:
    *   `UI Composition`: Built via `createRendererComposition`, bundling controllers for settings, language, search, and library management.
    *   **Bootstrap**: The app lifecycle is managed in `src/renderer/lifecycle/bootstrap.js`.
    *   **Communication**: IPC events are bound via `src/renderer/events/ipc-events.js` to communicate with the Main process via `window.electronAPI`.

## Communication Bridge (`src/preload.js`)
Acts as the secure bridge between Main and Renderer, exposing limited IPC channels.

## Key Directories
*   `src/main/`: Core logic modules.
*   `src/renderer/`: UI components and logic (separated into `bootstrap/`, `events/`, `lifecycle/`, `state/`, `ui-components/`, etc.).
*   `src/shared/`: Shared utilities (e.g., `installer-contract.js`).
*   `src/styles/`: Modular CSS files for theming and layout.

## Data Flow
1.  **Startup**: `src/main.js` initializes all services, loads the JSON database, and opens the main window.
2.  **UI Boot**: `src/renderer.js` waits for `DOMContentLoaded`, builds UI references, initializes the runtime state, and bootstraps the UI controller composition.
3.  **Interaction**: User actions in the UI trigger IPC events via the preload bridge, which are handled in the Main process by `registerMainIpc`.
