# Source Baseline

Forked from https://github.com/CNFeffery/dash-devtools-plus at tag `v0.1.4`
(`de625bcc44e7ac79f79eaea800269aefb0145424`). The MIT license is retained.
The Python backend is unchanged; local changes add automatic light/dark theming
to the frontend, including native toolbar skins and same-origin error frames.

The host application's explicit root theme takes priority over the operating
system. Changing the color scheme does not overwrite the selected toolbar skin
or its persisted storage value. Hosts without a theme marker follow the system.

This fork lives at https://github.com/c0debeez/dash-devtools-plus on branch
`fix/host-theme`. Build with `npm ci && npm run build`; frontend regression tests
run with `npm run test:frontend`. Generated assets are committed so installation
from Git does not require Node or a frontend build.
Downstream applications should pin a full Git commit with uv rather than copy
this repository into their workspace.
Keep backend changes separate when updating this baseline.
