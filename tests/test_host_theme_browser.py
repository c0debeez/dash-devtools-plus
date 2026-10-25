"""Opt-in real Dash/browser contracts: RUN_BROWSER_TESTS=1 pytest -q this_file."""

import os
import shutil
from threading import Thread

import pytest
from dash import Dash, Input, Output, html
from werkzeug.serving import make_server

from dash_devtools_plus import configure_devtools_plus

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_BROWSER_TESTS") != "1",
    reason="Set RUN_BROWSER_TESTS=1 and install playwright to run browser tests",
)


@pytest.fixture
def browser_page(request):
    playwright = pytest.importorskip("playwright.sync_api")
    library = getattr(request, "param", "plain")
    configure_devtools_plus()
    if library == "bootstrap":
        configure_devtools_plus(theme_selector="#bootstrap-host")
    app = Dash(__name__)
    app.layout = html.Div(
        [html.Button("Provider theme", id="provider-theme"), html.Div(id="result")]
    )
    if library == "mantine":
        dmc = pytest.importorskip("dash_mantine_components")
        app.layout = dmc.MantineProvider(
            app.layout, id="mantine-host", forceColorScheme="dark"
        )
        app.callback(
            Output("mantine-host", "forceColorScheme"),
            Input("provider-theme", "n_clicks"),
            prevent_initial_call=True,
        )(lambda n: "light" if n % 2 else "dark")
    elif library == "bootstrap":
        dbc = pytest.importorskip("dash_bootstrap_components")
        app.layout = html.Div(
            dbc.Button("Bootstrap host", id="provider-theme"),
            id="bootstrap-host",
            **{"data-bs-theme": "dark"},
        )
        app.callback(
            Output("bootstrap-host", "data-bs-theme"),
            Input("provider-theme", "n_clicks"),
            prevent_initial_call=True,
        )(lambda n: "light" if n % 2 else "dark")
    else:
        app.clientside_callback(
            """function (n) {
            const mode = n % 2 ? 'dark' : 'light';
            window.DashDevtoolsPlus.setColorScheme(mode);
            return mode;
        }""",
            Output("result", "children"),
            Input("provider-theme", "n_clicks"),
            prevent_initial_call=True,
        )
    app.enable_dev_tools(
        debug=True, dev_tools_hot_reload=False, dev_tools_disable_version_check=True
    )
    server = make_server("127.0.0.1", 0, app.server, threaded=True)
    worker = Thread(target=server.serve_forever, daemon=True)
    worker.start()
    try:
        with playwright.sync_playwright() as pw:
            browser = pw.chromium.launch(
                executable_path=shutil.which("google-chrome"),
                args=["--no-sandbox"],
            )
            try:
                page = browser.new_page(color_scheme="light")
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.on(
                    "console",
                    lambda message: (
                        errors.append(message.text) if message.type == "error" else None
                    ),
                )
                page.goto(f"http://127.0.0.1:{server.server_port}")
                page.wait_for_function("!!window.DashDevtoolsPlus?.setColorScheme")
                page.locator("#provider-theme").wait_for(state="visible")
                if library == "plain":
                    page.evaluate(
                        "document.documentElement.removeAttribute('data-mantine-color-scheme')"
                    )
                yield page
                assert not errors
            finally:
                browser.close()
    finally:
        server.shutdown()
        worker.join(timeout=10)
        server.server_close()
        configure_devtools_plus()


def expect_scheme(page, mode):
    try:
        page.wait_for_function(
            "mode => document.documentElement.getAttribute('data-ddp-color-scheme') === mode",
            arg=mode,
            timeout=10000,
        )
    except Exception as error:
        raise AssertionError(
            page.evaluate("""() => ({
            root: document.documentElement.outerHTML.split('>')[0],
            body: document.body.outerHTML.split('>')[0],
            rootCSS: getComputedStyle(document.documentElement).colorScheme,
            bodyCSS: getComputedStyle(document.body).colorScheme,
            style: document.getElementById('host-style')?.outerHTML,
            styleRules: document.getElementById('host-style')?.sheet?.cssRules?.length,
        })""")
        ) from error


@pytest.mark.parametrize("browser_page", ["mantine", "bootstrap"], indirect=True)
def test_component_library_provider_switch(browser_page):
    page = browser_page
    expect_scheme(page, "dark")
    page.locator("#provider-theme").click()
    expect_scheme(page, "light")
    page.locator("#provider-theme").click()
    expect_scheme(page, "dark")


def test_host_markers_and_runtime_controller(browser_page):
    page = browser_page
    expect_scheme(page, "light")
    for marker in (
        "data-bs-theme",
        "data-mantine-color-scheme",
        "data-theme",
        "data-color-scheme",
    ):
        for mode in ("dark", "light"):
            page.evaluate(
                "([marker, mode]) => document.documentElement.setAttribute(marker, mode)",
                [marker, mode],
            )
            expect_scheme(page, mode)
        page.evaluate(
            "marker => document.documentElement.removeAttribute(marker)", marker
        )

    page.evaluate("document.body.setAttribute('data-theme', 'dark')")
    expect_scheme(page, "dark")
    page.evaluate("document.body.removeAttribute('data-theme')")
    expect_scheme(page, "light")
    page.evaluate("""() => {
        window.DashDevtoolsPlus.configureTheme({themeSelector: '#theme-host'});
        const node = document.createElement('div');
        node.id = 'theme-host'; node.dataset.theme = 'dark';
        document.getElementById('result').append(node);
    }""")
    expect_scheme(page, "dark")
    page.evaluate("""() => {
        const node = document.createElement('div');
        node.id = 'theme-host'; node.dataset.theme = 'light';
        document.getElementById('theme-host').replaceWith(node);
    }""")
    expect_scheme(page, "light")
    page.evaluate("window.DashDevtoolsPlus.setColorScheme('dark')")
    expect_scheme(page, "dark")
    page.evaluate("window.DashDevtoolsPlus.setColorScheme('auto')")
    expect_scheme(page, "light")
    page.evaluate("window.DashDevtoolsPlus.configureTheme({themeSelector: null})")
    page.emulate_media(color_scheme="dark")
    expect_scheme(page, "dark")
    page.emulate_media(color_scheme="light")
    expect_scheme(page, "light")
    assert page.evaluate("""() => {
        try { window.DashDevtoolsPlus.configureTheme({themeSelector: '['}); }
        catch { return true; }
        return false;
    }""")
    expect_scheme(page, "light")


def test_computed_css_and_explicit_provider_callback(browser_page):
    page = browser_page
    page.evaluate("""() => {
        const style = document.createElement('style');
        style.id = 'host-style'; style.textContent = ':root { color-scheme: dark; }';
        document.head.append(style);
    }""")
    expect_scheme(page, "dark")
    page.evaluate(
        "document.getElementById('host-style').textContent = ':root { color-scheme: light; }'"
    )
    expect_scheme(page, "light")
    page.evaluate("""() => {
        document.getElementById('host-style').sheet.insertRule('body { color-scheme: dark; }', 1);
        window.DashDevtoolsPlus.refreshTheme();
    }""")
    expect_scheme(page, "dark")
    page.evaluate("document.getElementById('host-style').remove()")
    expect_scheme(page, "light")
    page.route(
        "**/host-theme.css",
        lambda route: route.fulfill(
            content_type="text/css", body=":root { color-scheme: dark; }"
        ),
    )
    page.evaluate("""() => {
        const link = document.createElement('link');
        link.id = 'host-link'; link.rel = 'stylesheet'; link.href = '/host-theme.css';
        document.head.append(link);
    }""")
    expect_scheme(page, "dark")
    page.evaluate("document.getElementById('host-link').media = 'not all'")
    expect_scheme(page, "light")
    page.evaluate("document.getElementById('host-link').remove()")
    page.locator("#provider-theme").click()
    expect_scheme(page, "dark")
    page.locator("#provider-theme").click()
    expect_scheme(page, "light")
    assert page.evaluate("!document.documentElement.hasAttribute('data-theme')")


def test_drawer_follows_scheme_and_preserves_skin_on_mobile(browser_page):
    page = browser_page
    page.locator(".dash-debug-menu__toggle").wait_for(state="visible")
    if page.locator(".dash-debug-menu__toggle--collapsed").count():
        page.locator(".dash-debug-menu__toggle").click()
    page.locator("#dash-devtools-plus-button").click()
    page.locator(".ddp-drawer").wait_for(state="visible")
    background = (
        "getComputedStyle(document.querySelector('.ddp-drawer')).backgroundColor"
    )
    light = page.evaluate(background)
    page.evaluate("""() => {
        document.documentElement.setAttribute('data-ddp-native-toolbar-theme', 'mint-circuit');
        document.documentElement.setAttribute('data-bs-theme', 'dark');
    }""")
    expect_scheme(page, "dark")
    page.wait_for_function(f"{background} !== {light!r}")
    page.evaluate("document.documentElement.setAttribute('data-bs-theme', 'light')")
    expect_scheme(page, "light")
    page.wait_for_function(f"{background} === {light!r}")
    assert (
        page.evaluate("document.documentElement.dataset.ddpNativeToolbarTheme")
        == "mint-circuit"
    )
    page.set_viewport_size({"width": 390, "height": 844})
    page.wait_for_function("""() => {
        const rect = document.querySelector('.ddp-drawer').getBoundingClientRect();
        return rect.left >= 0 && rect.right <= innerWidth && rect.width > 0;
    }""")
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
