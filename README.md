# System Monitor Alert

A GNOME Shell extension for Fedora Workstation that:

- Shows live CPU % and RAM % in the top panel.
- Pops up a notification when CPU or RAM usage crosses a threshold you set (85% by default).
- Lists the top 5 CPU-hungry and top 5 RAM-hungry processes in the notification and in a dropdown menu (click the panel indicator).
- Lets you tune thresholds, check interval, and alert cooldown from a Settings panel.

## Requirements

- Fedora Workstation with GNOME Shell 45 or newer (Fedora 39+).
- `glib-compile-schemas` (part of `glib2-devel` / usually already installed).

## Install

```bash
# 1. Copy the extension into your local extensions folder
mkdir -p ~/.local/share/gnome-shell/extensions
cp -r system-monitor-alert@local.dev ~/.local/share/gnome-shell/extensions/

# 2. Compile the settings schema
glib-compile-schemas ~/.local/share/gnome-shell/extensions/system-monitor-alert@local.dev/schemas/

# 3. Restart GNOME Shell
#    - X11: press Alt+F2, type "r", press Enter
#    - Wayland: log out and log back in

# 4. Enable the extension
gnome-extensions enable system-monitor-alert@local.dev
```

If `gnome-extensions enable` says it can't find the extension, log out/in once first so
GNOME Shell picks up the new folder, then try again.

## Configure

```bash
gnome-extensions prefs system-monitor-alert@local.dev
```

or click the panel indicator → "Settings…".

You can adjust:
- **CPU / Memory threshold** — the % that triggers a notification.
- **Check interval** — how often usage is sampled (default: every 3s).
- **Alert cooldown** — minimum time between repeat alerts for the same resource (default: 60s), so you're not spammed.

## Uninstall

```bash
gnome-extensions disable system-monitor-alert@local.dev
rm -rf ~/.local/share/gnome-shell/extensions/system-monitor-alert@local.dev
```

## Notes

- CPU usage is computed from `/proc/stat` deltas between samples (standard technique — the first
  reading right after enabling will show 0% until the second sample).
- Memory usage uses `MemAvailable` from `/proc/meminfo`, which accounts for reclaimable cache
  (the same figure `free -h` and most system monitors use).
- Top processes come from `ps -eo pid,comm,%cpu,%mem --sort=-%cpu` / `--sort=-%mem`.
# System-Monitor-Alert-Gnome-Extension
# System-Monitor-Alert-Gnome-Extension
