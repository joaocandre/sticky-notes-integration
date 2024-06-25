import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import * as Config from 'resource:///org/gnome/Shell/Extensions/js/misc/config.js';
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import * as UI from './lib/ui.js';
import { is_available, get_autostart, set_autostart, execute } from './lib/utils.js';
import { AppInfo, Visibility, PanelPosition, StickyNotesAction } from './lib/globals.js';

//------------------------------------------------------------------------------
/// @brief Fill preferences page with general/behavior settings
///
/// @param      {Adw.PreferencesPage}  Page to fill.
/// @param      {Gio.Settings}         Extension settings.
///
function fillGeneralPage(page, settings)  {
    // 'General > Behavior'
    const behavior_group = new Adw.PreferencesGroup({ title: _('Behavior') });

    UI.addToggleRow(behavior_group, 'Launch on Startup', 'Start Sticky Notes when user logs in', settings, 'auto-start');
    UI.addToggleRow(behavior_group, 'Keep Alive', 'Have Sticky Notes running at all times', settings, 'keep-alive');
    UI.addSelectionRow(behavior_group, 'Override Background Menu', 'Add \'New Note\' to Gnome\'s background menu', settings, 'override-background-menu',
        UI.selectFrom(Visibility));

    // update auto-start status on setting change
    // @note not shell-related, therefore easier to just handle it on preferences script
    settings.set_boolean('auto-start', get_autostart(AppInfo['id']));
    settings.connect('changed::auto-start', () => {
        set_autostart(AppInfo['id'], settings.get_boolean('auto-start'));
        settings.set_boolean('auto-start', get_autostart(AppInfo['id']));
    });

    page.add(behavior_group);

    return [behavior_group];
}

//------------------------------------------------------------------------------
/// @brief Fill preferences page with indicator settings
///
/// @param      {Adw.PreferencesPage}  Page to fill.
/// @param      {Gio.Settings}         Extension settings.
///
function fillIndicatorPage(page, settings) {
    // 'Indicator > Appearance'
    const appearance_group = new Adw.PreferencesGroup({ title: _('Appearance') });

    UI.addSelectionRow(appearance_group, 'Show Indicator', 'When to show panel indicator', settings, 'show-panel-indicator',
        UI.selectFrom(Visibility));
    UI.addToggleRow(appearance_group, 'Show Open Note Count', 'Display number of open notes next to indicator', settings, 'show-open-note-count');
    UI.addSelectionRow(appearance_group, 'Indicator Position', 'Where to place panel indicator', settings, 'panel-indicator-position',
        UI.selectFrom(PanelPosition), [ UI.createSpinButton(settings, 'panel-indicator-position-order', 0, 9, 0, 1, 'Order (#) in alignment group') ]);
    UI.addToggleRow(appearance_group, 'Use Built-in Icon', 'Prefer default extension icon over system theme', settings, 'use-builtin-icon');

    // 'Indicator > Actions'
    const actions_group = new Adw.PreferencesGroup({ title: _('Quick Actions'), /* description: _('Indicator icon behavior / mouse bindings') */ });

    const mouse_bindings_row = UI.addRow(actions_group, 'Mouse Buttons', 'Left, Middle and Right',
        [ UI.createSelection(settings, 'left-button-press-action', UI.selectFrom(StickyNotesAction), 'Left Button Press'),
          UI.createSelection(settings, 'middle-button-press-action', UI.selectFrom(StickyNotesAction), 'Middle Button Press'),
          UI.createSelection(settings, 'right-button-press-action', UI.selectFrom(StickyNotesAction), 'Right Button Press') ]);
    const mouse_scroll_row = UI.addRow(actions_group, 'Scroll Wheel', 'Up and Down',
        [ UI.createSelection(settings, 'scroll-up-action', UI.selectFrom(StickyNotesAction), 'Scroll Up'),
          UI.createSelection(settings, 'scroll-down-action', UI.selectFrom(StickyNotesAction), 'Scroll Down') ]);

    // customize row icons
    mouse_bindings_row.set_icon_name('input-mouse-symbolic');         // alternatives: input-mouse-symbolic, find-location-symbolic, input-touchpad-symbolic
    mouse_scroll_row.set_icon_name('object-flip-vertical-symbolic');  // alternatives: view-wrapped-symbolic-rtl, view-fullscreen-symbolic, mail-send-receive-symbolic

    // disable options when indicator is disabled
    settings.connect('changed::show-panel-indicator', (settings, key) => {
        const show_indicator = Boolean(settings.get_int(key));
        // disable remaining settings
        show_open_note_count_row.set_sensitive(show_indicator);
        panel_indicator_position_row.set_sensitive(show_indicator);
        use_builtin_icon_row.set_sensitive(show_indicator);
        actions_group.set_sensitive(show_indicator);
    });

    page.add(appearance_group);
    page.add(actions_group);

    return [appearance_group, actions_group];
}

//------------------------------------------------------------------------------
/// @brief Fill preferences page with extension information.
///
/// @param      {Adw.PreferencesPage}  page     Page to fill.
/// @param      {Gio.Settings}         metadata Extension metadata.
///
function fillAboutPage(page, metadata) {
    // 'About > Logo'
    const logo_group = new Adw.PreferencesGroup();
    logo_group.add(UI.createImageBox(AppInfo['icon-name'], metadata['name'], metadata['description']));

    // 'About > Extension/App Info'
    const info_group = new Adw.PreferencesGroup();

    // get/parse extension and app versions
    const extension_version = metadata['version-name'] ?? metadata['version'].toString();
    const extension_version_icon_name = (extension_version ? 'adw-external-link-symbolic' :  'dialog-error-symbolic');
    const sticky_version = AppInfo['version'];
    const sticky_version_icon_name = (sticky_version ? 'adw-external-link-symbolic' :  'dialog-error-symbolic');

    UI.addRow(info_group, 'Version', '', [ new Gtk.Label({ label: `${extension_version}` }),
                                           new Gtk.LinkButton({ icon_name: extension_version_icon_name, uri: metadata['url'] }) ]);
    UI.addRow(info_group, 'Sticky Notes Version', '', [ new Gtk.Label({ label: `${sticky_version}` }),
                                                        new Gtk.LinkButton({ icon_name: sticky_version_icon_name, uri: 'https://flathub.org/apps/com.vixalien.sticky' }) ]);
    UI.addRow(info_group, 'GNOME Version', '', [ new Gtk.Label({ label: `${Config.PACKAGE_VERSION.toString()}` }),
                                                 new Gtk.LinkButton({ icon_name: 'adw-external-link-symbolic', uri: `https://release.gnome.org/${Config.PACKAGE_VERSION.toString().split('.')[0]}` }) ]);
    UI.addRow(info_group, 'Author', '', [ new Gtk.Label({ label: 'João André' }),
                                          new Gtk.LinkButton({ icon_name: 'adw-external-link-symbolic', uri: 'https://github.com/joaocandre' }) ]);

    // 'About > Licence (disclaimer)'
    const license_group = new Adw.PreferencesGroup();
    license_group.add(UI.createLicenseDisclaimer('GNU General Public License, version 2 or later', 'https://www.google.com'));

    page.add(logo_group);
    page.add(info_group);
    page.add(license_group);

    return [logo_group, info_group, license_group];
}

//------------------------------------------------------------------------------
/// @brief Class that implements preferences windo for the Sticky Notes Integration extension
///
export default class StickyNotesIntegrationPreferences extends ExtensionPreferences {

    fillPreferencesWindow(window) {
        window._settings = this.getSettings();
        window.search_enabled = true;

        // 'General'
        const general_page = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'preferences-system-symbolic'
        });
        window.add(general_page);
        this._general_groups = fillGeneralPage(general_page, this.getSettings());

        // 'Indicator'
        const indicator_page = new Adw.PreferencesPage({
            title: _('Indicator'),
            icon_name: 'view-pin-symbolic'
        });
        window.add(indicator_page);
        this._indicator_groups = fillIndicatorPage(indicator_page, this.getSettings());

        // 'About' page
        const about_page = new Adw.PreferencesPage({
            title: _('About'),
            icon_name: 'dialog-information-symbolic',
        });
        window.add(about_page);
        this._about_groups = fillAboutPage(about_page, this.metadata);

        // check if Sticky Notes is installed, disable all settings if not
        if (!is_available(AppInfo['process'])) {
            this.disable();
            UI.addErrorBox(general_page, 'Sticky Notes is not installed');
            return;
        }

        // clean member instances on window close
        window.connect('close-request', () => {
            this._general_groups = null;
            this._indicator_groups = null;
            this._about_groups = null;
        });
    }

    disable() {
        for (const group of this._general_groups) {
            group.set_sensitive(false);
        }
        for (const group of this._indicator_groups) {
            group.set_sensitive(false);
        }
    }

}