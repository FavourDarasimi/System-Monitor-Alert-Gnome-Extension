import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class SystemMonitorAlertPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window._settings = settings;

        const page = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'utilities-system-monitor-symbolic',
        });
        window.add(page);

        // --- Alert thresholds ---
        const thresholdGroup = new Adw.PreferencesGroup({
            title: _('Alert Thresholds'),
            description: _('Get notified when usage crosses these levels'),
        });
        page.add(thresholdGroup);

        const cpuRow = new Adw.SpinRow({
            title: _('CPU threshold (%)'),
            subtitle: _('Send a notification when CPU usage reaches this level'),
            adjustment: new Gtk.Adjustment({
                lower: 10,
                upper: 100,
                step_increment: 1,
                page_increment: 5,
            }),
        });
        thresholdGroup.add(cpuRow);
        settings.bind('cpu-threshold', cpuRow, 'value', Gio.SettingsBindFlags.DEFAULT);

        const memRow = new Adw.SpinRow({
            title: _('Memory threshold (%)'),
            subtitle: _('Send a notification when RAM usage reaches this level'),
            adjustment: new Gtk.Adjustment({
                lower: 10,
                upper: 100,
                step_increment: 1,
                page_increment: 5,
            }),
        });
        thresholdGroup.add(memRow);
        settings.bind('mem-threshold', memRow, 'value', Gio.SettingsBindFlags.DEFAULT);

        // --- Timing ---
        const timingGroup = new Adw.PreferencesGroup({
            title: _('Timing'),
        });
        page.add(timingGroup);

        const intervalRow = new Adw.SpinRow({
            title: _('Check interval (seconds)'),
            subtitle: _('How often to sample CPU and RAM usage'),
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 60,
                step_increment: 1,
                page_increment: 5,
            }),
        });
        timingGroup.add(intervalRow);
        settings.bind('check-interval', intervalRow, 'value', Gio.SettingsBindFlags.DEFAULT);

        const cooldownRow = new Adw.SpinRow({
            title: _('Alert cooldown (seconds)'),
            subtitle: _('Minimum time between repeated alerts of the same kind'),
            adjustment: new Gtk.Adjustment({
                lower: 10,
                upper: 3600,
                step_increment: 10,
                page_increment: 60,
            }),
        });
        timingGroup.add(cooldownRow);
        settings.bind('alert-cooldown', cooldownRow, 'value', Gio.SettingsBindFlags.DEFAULT);
    }
}
