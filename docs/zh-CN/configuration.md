# ⚙️ 配置参数

配置是可选的。安装本包后，Dash 会通过 `dash_hooks` 入口点自动发现并注册 Devtools Plus；使用默认设置时，无需导入本包，也无需调用 `configure_devtools_plus()`。

仅当需要覆盖默认值时，才在创建 `Dash` 应用实例前调用 `configure_devtools_plus()`：

```python
from pathlib import Path

from dash_devtools_plus import configure_devtools_plus

configure_devtools_plus(
    default_locale="zh-CN",
    accent_color="#119DFF",
    editor="vscode",
    project_root=Path(__file__).resolve().parent,
)
```

## 🎛️ 参数一览

| 参数 | 类型 | 默认值 | 作用 |
| --- | --- | --- | --- |
| `default_locale` | `"en"` 或 `"zh-CN"` | `"en"` | 面板初始语言。用户在浏览器中切换过语言后，本地偏好优先。 |
| `accent_color` | `str` | `"#119DFF"` | Devtools Plus 控件和高亮区域使用的主强调色。 |
| `color_scheme` | `"auto"`、`"light"` 或 `"dark"` | `"auto"` | 自动跟随宿主亮暗模式，或固定为亮色/暗色。 |
| `theme_selector` | `str` 或 `None` | `None` | 可选的宿主主题容器 CSS 选择器，以第一个匹配节点为准。 |
| `editor` | `"vscode"`、`"cursor"`、`"pycharm"` 或 `None` | `"vscode"` | 源码打开动作优先使用的编辑器。设为 `None` 时不指定首选编辑器。 |
| `project_root` | `str`、`Path` 或 `None` | `None` | 服务端用于定位源码、扫描直接导入依赖的项目边界；必须是已存在目录。 |
| `editor_project_root` | `str`、`Path` 或 `None` | `None` | 浏览器/IDE 可见的项目根目录。Dash 服务端与本地编辑器看到的文件路径不同的时候使用。 |

## 跟随宿主亮暗主题

抽屉、监控图表、原生工具栏皮肤及同源错误页面会跟随宿主亮暗模式，且不会重置已选皮肤。
这里同步的是亮暗模式，不会自动继承宿主的任意配色、字体或组件设计令牌。

`auto` 模式依次读取 `theme_selector` 指定容器、`body`、`html` 的显式标记。
每个节点内依次识别 `data-theme`、`data-color-scheme`、`data-mantine-color-scheme`、
`data-bs-theme`，然后识别 `dark`/`light` 类名和内联 `color-scheme`。
没有显式标记时，读取这些节点的 CSS 计算样式，最后才使用系统偏好。
`light dark` 等不明确的值不视为已选择的模式。DOM、样式表、主题容器替换及系统偏好变化会自动同步。
多个组件库的标记冲突时，请指定唯一权威容器，或显式固定模式。

```python
configure_devtools_plus(color_scheme="auto", theme_selector="#app-theme")
```

仅通过 React Provider 切换主题的组件库（如 Ant Design ConfigProvider）不一定设置 DOM 标记，
需要在 Dash 客户端回调中显式同步：

```javascript
function (mode) {
    window.DashDevtoolsPlus.setColorScheme(mode); // "light"、"dark" 或 "auto"
    return window.dash_clientside.no_update;
}
```

请在 hooks 脚本加载后调用。运行时覆盖持续至配置再次变化或页面重新加载，不修改宿主主题或本地存储。
`configureTheme({colorScheme: "auto", themeSelector: "#app-theme"})` 可同时更新两个选项；
传入 `themeSelector: null` 可清除容器设置。`refreshTheme()` 可在没有 DOM 变更的外部样式修改
（如 `CSSStyleSheet.insertRule`）后重新检查。无效模式或 CSS 选择器会抛出异常，并保留原配置。
容器尚不存在时回退到 `body`/`html`，稍后插入容器会自动识别。

浏览器回归测试按需启用。构建前端并安装 `playwright`、`dash-mantine-components`、
`dash-bootstrap-components` 后运行：

```bash
python -m playwright install chromium
RUN_BROWSER_TESTS=1 REACT_VERSION=19.2.4 python -m pytest -q tests/test_host_theme_browser.py
```

测试覆盖真实 Mantine/Bootstrap 组件、宿主标记、CSS 计算样式、外部样式表加载、容器替换、
客户端同步与移动端抽屉布局。使用 React 18 的 Dash 运行时，如果已安装的 Mantine 版本要求
React 19，可添加 `-k 'not mantine'`。

## 💻 本地服务端与本地编辑器

普通本地项目只设置 `project_root` 即可：

```python
configure_devtools_plus(project_root=Path(__file__).resolve().parent)
```

## 📦 容器中的服务端与本地编辑器

服务端可能看到 `/app`，而编辑器看到 Windows 或 macOS 上的本地目录。此时应分别提供服务端边界和编辑器目标：

```python
configure_devtools_plus(
    project_root="/app",
    editor_project_root=r"C:\projects\my-dash-app",
    editor="cursor",
)
```

`project_root` 同时是源码元数据的安全边界：位于该目录之外的文件不会作为项目回调源码或项目直接导入项暴露。

## 🧩 多个 Dash 应用

注册过程是幂等的。同一进程可创建多个 Dash 应用，Devtools Plus 会把调试状态和组件属性绑定到各自所属的应用。请在创建这些应用前配置共享默认值。
