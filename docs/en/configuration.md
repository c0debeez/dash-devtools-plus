# ⚙️ Configuration

Configuration is optional. After the package is installed, Dash automatically discovers and registers Devtools Plus through its `dash_hooks` entry point; the default setup does not require importing this package or calling `configure_devtools_plus()`.

Call `configure_devtools_plus()` before creating the `Dash` application instance only when you need to override a default:

```python
from pathlib import Path

from dash_devtools_plus import configure_devtools_plus

configure_devtools_plus(
    default_locale="en",
    accent_color="#119DFF",
    editor="vscode",
    project_root=Path(__file__).resolve().parent,
)
```

## 🎛️ Parameters

| Parameter | Type | Default | Purpose |
| --- | --- | --- | --- |
| `default_locale` | `"en"` or `"zh-CN"` | `"en"` | Initial panel language. A language selected in the browser takes precedence on later visits. |
| `accent_color` | `str` | `"#119DFF"` | Primary accent color for Devtools Plus controls and highlights. |
| `color_scheme` | `"auto"`, `"light"`, or `"dark"` | `"auto"` | Follow host light/dark mode or force a scheme. |
| `theme_selector` | `str` or `None` | `None` | Optional CSS selector for the host theme container; the first match wins. |
| `editor` | `"vscode"`, `"cursor"`, `"pycharm"`, or `None` | `"vscode"` | Preferred editor used by source-opening actions. `None` disables choosing a preferred editor. |
| `project_root` | `str`, `Path`, or `None` | `None` | Server-side project boundary for source locations and direct-import dependency discovery. It must be an existing directory. |
| `editor_project_root` | `str`, `Path`, or `None` | `None` | Client-visible project root. Use it when the Dash server and browser/IDE use different filesystem paths. |

## Host light/dark mode

The drawer, monitoring charts, native toolbar skins and same-origin error frames
follow the host scheme without resetting the selected toolbar skin. This follows
light/dark mode only, not arbitrary host palettes, fonts or component tokens.

In `auto` mode, explicit markers on `theme_selector`, `body`, then `html` take
precedence. Within each node, `data-theme`, `data-color-scheme`,
`data-mantine-color-scheme`, then `data-bs-theme` precede `dark`/`light` classes
and inline `color-scheme`. Computed CSS `color-scheme` on those same nodes is
the fallback, followed by the system preference. Ambiguous values such as
`light dark` are not treated as a selected scheme. DOM and stylesheet changes,
container replacement and system preference changes are observed automatically.
For conflicting library markers, select one authoritative container or force a mode.

```python
configure_devtools_plus(color_scheme="auto", theme_selector="#app-theme")
```

React Provider-only themes (including Ant Design ConfigProvider) do not necessarily
publish DOM markers. Synchronize them explicitly from a Dash clientside callback:

```javascript
function (mode) {
    window.DashDevtoolsPlus.setColorScheme(mode); // "light", "dark" or "auto"
    return window.dash_clientside.no_update;
}
```

Call this after the hooks bundle loads. Runtime overrides last until the next
configuration change or page reload; they do not modify the host theme or local
storage. `configureTheme({colorScheme: "auto", themeSelector: "#app-theme"})`
updates both options; `themeSelector: null` clears the container selector.
`refreshTheme()` rechecks CSS after external changes not represented by DOM
mutations (for example, `CSSStyleSheet.insertRule`). Invalid runtime modes or CSS
selectors throw without changing the previous configuration. A missing container
falls back to `body`/`html` and is picked up if inserted later.

Browser regression tests are opt-in. After building the frontend and installing
`playwright`, `dash-mantine-components`, and `dash-bootstrap-components`, run:

```bash
python -m playwright install chromium
RUN_BROWSER_TESTS=1 REACT_VERSION=19.2.4 python -m pytest -q tests/test_host_theme_browser.py
```

The suite covers actual Mantine/Bootstrap components, host markers, computed CSS,
stylesheet loading, container replacement, clientside synchronization and mobile
drawer layout. On a React 18 Dash runtime, use `-k 'not mantine'` when the installed
Mantine version requires React 19.

## 💻 Local server and local editor

For a typical local checkout, `project_root` is enough:

```python
configure_devtools_plus(project_root=Path(__file__).resolve().parent)
```

## 📦 Containerized server and local editor

The server may see `/app` while your editor sees a Windows or macOS checkout. Keep the server boundary and editor target separate:

```python
configure_devtools_plus(
    project_root="/app",
    editor_project_root=r"C:\projects\my-dash-app",
    editor="cursor",
)
```

`project_root` is also the security boundary for source metadata: files outside it are not exposed as project callback sources or direct project imports.

## 🧩 Multiple Dash applications

Registration is idempotent. A process can create multiple Dash applications, and Devtools Plus binds its debug state and component properties to the owning app. Configure shared defaults before creating those apps.
