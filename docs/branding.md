# VentusIQ branding

The public dashboard uses the owner's existing VentusIQ brand at their request.

- Wordmark: byte-for-byte copy of `data/dashboard_assets/branding/ventus logo.png`
  from the source project, displayed in the header and About panel.
- Cloud icon: original `src/dashboard/assets/ventus icon logo.svg`, plus its
  embedded PNG extracted without pixel modification, used in the header, About,
  and favicon.
- Palette: the current `src/dashboard/terminal_v2.py` palette, with background
  `#0a0a0c`, surfaces `#111115` / `#161620`, borders `#26262e` / `#353541`, text
  `#f4f4f5`, and blue `#3b9dff` / `#0e2747` / `#1d4373`. This is the current blue
  terminal palette, rather than the violet palette in the older design proposal.
- Typography: the project's Geist and Geist Mono variable webfonts, plus Geist
  Pixel Line for headline counters and Geist Pixel Square for alert detail titles.
  All are self-hosted, with upstream SIL OFL notices retained.
- Identity: VentusIQ Open Weather in title, metadata, header, intro, footer, About,
  and documentation. The repository/package slug remains `weather-commons`.

Severity colors retain their weather meaning. A healthy feed uses the terminal's
green status indicator; blue is used for branding and selection.
