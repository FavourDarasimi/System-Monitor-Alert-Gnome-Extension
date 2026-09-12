import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const PROC_COUNT = 5;

const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init(extensionObject) {
        super._init(0.0, _('System Monitor Alert'));

        this._extension = extensionObject;
        this._settings = extensionObject.getSettings();

        // --- Panel widget: icon + live percentages ---
        const box = new St.BoxLayout({style_class: 'system-monitor-alert-box'});

        this._icon = new St.Icon({
            icon_name: 'utilities-system-monitor-symbolic',
            style_class: 'system-status-icon',
        });
        box.add_child(this._icon);

        this._label = new St.Label({
            text: '…',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'system-monitor-alert-label',
        });
        box.add_child(this._label);

        this.add_child(box);

        // --- Dropdown menu: top CPU / memory processes ---
        this._buildMenu();

        // --- State ---
        this._prevCpu = null;
        this._lastCpuAlert = 0;
        this._lastMemAlert = 0;
        this._notifSource = null;
        this._timeoutId = null;

        this._settingsChangedId = this._settings.connect('changed::check-interval', () => {
            this._restartLoop();
        });

        this._startLoop();
    }

    _buildMenu() {
        this._cpuHeader = new PopupMenu.PopupMenuItem(_('Top CPU usage'), {
            reactive: false,
            style_class: 'system-monitor-alert-section-title',
        });
        this.menu.addMenuItem(this._cpuHeader);

        this._cpuItems = [];
        for (let i = 0; i < PROC_COUNT; i++) {
            const item = new PopupMenu.PopupMenuItem('', {reactive: false});
            this._cpuItems.push(item);
            this.menu.addMenuItem(item);
        }

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._memHeader = new PopupMenu.PopupMenuItem(_('Top memory usage'), {
            reactive: false,
            style_class: 'system-monitor-alert-section-title',
        });
        this.menu.addMenuItem(this._memHeader);

        this._memItems = [];
        for (let i = 0; i < PROC_COUNT; i++) {
            const item = new PopupMenu.PopupMenuItem('', {reactive: false});
            this._memItems.push(item);
            this.menu.addMenuItem(item);
        }

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const refreshItem = new PopupMenu.PopupMenuItem(_('Refresh now'));
        refreshItem.connect('activate', () => this._update());
        this.menu.addMenuItem(refreshItem);

        const settingsItem = new PopupMenu.PopupMenuItem(_('Settings…'));
        settingsItem.connect('activate', () => this._extension.openPreferences());
        this.menu.addMenuItem(settingsItem);
    }

    _startLoop() {
        const interval = this._settings.get_int('check-interval');
        this._update();
        this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, interval, () => {
            this._update();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _restartLoop() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = null;
        }
        this._startLoop();
    }

    // Reads /proc/stat and returns cumulative idle/total jiffies
    _readCpuSnapshot() {
        try {
            const [ok, contents] = GLib.file_get_contents('/proc/stat');
            if (!ok)
                return null;

            const text = new TextDecoder().decode(contents);
            const firstLine = text.split('\n')[0]; // "cpu  user nice system idle iowait irq softirq steal guest guest_nice"
            const parts = firstLine.trim().split(/\s+/).slice(1).map(Number);

            const idle = (parts[3] || 0) + (parts[4] || 0); // idle + iowait
            const total = parts.reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0);

            return {idle, total};
        } catch (e) {
            logError(e, 'System Monitor Alert: failed to read /proc/stat');
            return null;
        }
    }

    _getCpuPercent() {
        const current = this._readCpuSnapshot();
        if (!current)
            return 0;

        if (!this._prevCpu) {
            this._prevCpu = current;
            return 0;
        }

        const idleDelta = current.idle - this._prevCpu.idle;
        const totalDelta = current.total - this._prevCpu.total;
        this._prevCpu = current;

        if (totalDelta <= 0)
            return 0;

        const usage = (1 - idleDelta / totalDelta) * 100;
        return Math.max(0, Math.min(100, usage));
    }

    _getMemPercent() {
        try {
            const [ok, contents] = GLib.file_get_contents('/proc/meminfo');
            if (!ok)
                return 0;

            const text = new TextDecoder().decode(contents);
            const info = {};
            for (const line of text.split('\n')) {
                const match = line.match(/^(\w+):\s+(\d+)/);
                if (match)
                    info[match[1]] = parseInt(match[2], 10);
            }

            const total = info.MemTotal;
            const available = info.MemAvailable;
            if (!total || available === undefined)
                return 0;

            return ((total - available) / total) * 100;
        } catch (e) {
            logError(e, 'System Monitor Alert: failed to read /proc/meminfo');
            return 0;
        }
    }

    // sortKey is "%cpu" or "%mem" (matches ps(1) --sort field names)
    _getTopProcesses(sortKey, count) {
        try {
            const [ok, stdout] = GLib.spawn_command_line_sync(
                `ps -eo pid,comm,%cpu,%mem --sort=-${sortKey} --no-headers`);

            if (!ok)
                return [];

            const text = new TextDecoder().decode(stdout);
            const lines = text.trim().split('\n').filter(line => line.trim().length > 0);

            return lines.slice(0, count).map(line => {
                const parts = line.trim().split(/\s+/);
                const pid = parts[0];
                const cpu = parts[parts.length - 2];
                const mem = parts[parts.length - 1];
                const comm = parts.slice(1, parts.length - 2).join(' ');
                return {pid, comm, cpu, mem};
            });
        } catch (e) {
            logError(e, 'System Monitor Alert: failed to run ps');
            return [];
        }
    }

    _update() {
        const cpuPercent = this._getCpuPercent();
        const memPercent = this._getMemPercent();

        this._label.set_text(`${Math.round(cpuPercent)}%  ${Math.round(memPercent)}%`);

        const topCpu = this._getTopProcesses('%cpu', PROC_COUNT);
        const topMem = this._getTopProcesses('%mem', PROC_COUNT);

        topCpu.forEach((proc, i) => {
            if (this._cpuItems[i])
                this._cpuItems[i].label.set_text(`${proc.comm}  (PID ${proc.pid})  —  ${proc.cpu}% CPU`);
        });
        for (let i = topCpu.length; i < PROC_COUNT; i++)
            this._cpuItems[i]?.label.set_text('');

        topMem.forEach((proc, i) => {
            if (this._memItems[i])
                this._memItems[i].label.set_text(`${proc.comm}  (PID ${proc.pid})  —  ${proc.mem}% MEM`);
        });
        for (let i = topMem.length; i < PROC_COUNT; i++)
            this._memItems[i]?.label.set_text('');

        this._maybeAlert(cpuPercent, memPercent, topCpu, topMem);
    }

    _maybeAlert(cpuPercent, memPercent, topCpu, topMem) {
        const cpuThreshold = this._settings.get_int('cpu-threshold');
        const memThreshold = this._settings.get_int('mem-threshold');
        const cooldown = this._settings.get_int('alert-cooldown');
        const now = GLib.get_monotonic_time() / 1000000;

        if (cpuPercent >= cpuThreshold && (now - this._lastCpuAlert) > cooldown) {
            this._lastCpuAlert = now;
            const topList = topCpu.slice(0, 3).map(p => `${p.comm} (${p.cpu}%)`).join(', ');
            this._notify(
                _('High CPU usage'),
                `${_('CPU is at')} ${Math.round(cpuPercent)}%. ${_('Top apps')}: ${topList}`
            );
        }

        if (memPercent >= memThreshold && (now - this._lastMemAlert) > cooldown) {
            this._lastMemAlert = now;
            const topList = topMem.slice(0, 3).map(p => `${p.comm} (${p.mem}%)`).join(', ');
            this._notify(
                _('High memory usage'),
                `${_('RAM is at')} ${Math.round(memPercent)}%. ${_('Top apps')}: ${topList}`
            );
        }
    }

    _getNotificationSource() {
        if (!this._notifSource) {
            this._notifSource = new MessageTray.Source({
                title: _('System Monitor Alert'),
                iconName: 'utilities-system-monitor-symbolic',
            });
            this._notifSource.connect('destroy', () => {
                this._notifSource = null;
            });
            Main.messageTray.add(this._notifSource);
        }
        return this._notifSource;
    }

    _notify(title, body) {
        const source = this._getNotificationSource();
        const notification = new MessageTray.Notification({
            source,
            title,
            body,
            urgency: MessageTray.Urgency.HIGH,
        });
        source.addNotification(notification);
    }

    destroy() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = null;
        }
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        this._notifSource?.destroy();
        super.destroy();
    }
});

export default class SystemMonitorAlertExtension extends Extension {
    enable() {
        this._indicator = new Indicator(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
