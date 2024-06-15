import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Visibility } from '../lib/globals.js';
import { safe_disconnect } from '../lib/utils.js';

//------------------------------------------------------------------------------
/// @brief Class that (dynamically) overrides/appends new entries to Gnome's default background context menu.
///
export const BackgroundMenuOverride = GObject.registerClass({
    GTypeName: 'BackgroundMenuOverride'
}, class BackgroundMenuOverride extends GObject.Object {
    //--------------------------------------------------------------------------
    /// @brief Number of items in Gnome's default background menu.
    ///
    /// @type       {Number}  Number of menu entries.
    ///
    /// @todo   Update dynamically on construction/initialization to account for future changes in Gnome Shell / additional overrides.
    ///
    static get _DEFAULT_BGMENU_ITEMS() { return 4; }

    //--------------------------------------------------------------------------
    /// @brief Constructs a new instance.
    ///
    /// @param      {Extension}             extension       Extension instance.
    /// @param      {StickyNotesInterface}  sticky_notes    StickyNotesInterface instance providing app interface.
    ///
    constructor(extension, sticky_notes) {
        super();

        this._settings = extension.getSettings();
        this._sticky_notes = sticky_notes;
        this._background_menu = null;
    }

    //--------------------------------------------------------------------------
    /// @brief Enables menu override
    ///
    enable() {
        this._on_settings_change_id = this._settings.connect('changed::override-background-menu', this._update.bind(this));
        this._on_active_change_id = this._sticky_notes.connect('notify::active', this._update.bind(this));

        // @note shell will reset background menu on multiple signal/events such as monitor connect/disconnect, login/logout and lock/unlock.
        //       as a failsafe, we connect to different shell signals to ensure background menu is kept overriden/updated at all times.
        //       some may be redundant, but overhead should be negligible; needs additional testing (!)
        this._on_monitors_changed_id = Main.layoutManager.connect('monitors-changed', this._update.bind(this));
        this._on_startup_complete_id = Main.layoutManager.connect('startup-complete', this._update.bind(this));
        this._on_session_mode_updated_id = Main.sessionMode.connect('updated', this._update.bind(this));
        this._on_locked_changed_id = Main.screenShield.connect('locked-changed', this._update.bind(this));
        this._on_active_changed_id = Main.screenShield.connect('active-changed', this._update.bind(this));
        this._on_wake_up_screen_id = Main.screenShield.connect('wake-up-screen', this._update.bind(this));

        this._update();
    }

    //--------------------------------------------------------------------------
    /// @brief  Checks if menu has been overriden (i.e. has *any* extra entries).
    ///
    /// @return     {boolean}  True if overriden, False otherwise.
    ///
    _isOverriden() {
        return(Main.layoutManager._bgManagers[0].backgroundActor._backgroundMenu.numMenuItems > BackgroundMenuOverride._DEFAULT_BGMENU_ITEMS);
    }

    //--------------------------------------------------------------------------
    /// @brief Updates Gnome background menu.
    ///
    _update() {
        const visible = this._settings.get_int('override-background-menu');
        const should_override = !!(visible === Visibility['Always'] || ((visible === Visibility['Dynamic']) && this._sticky_notes.active));
        if (should_override && !this._isOverriden()) {
            this.apply();
        } else if (!should_override && this._isOverriden()) {
            this.revert();
        }
    }

    //--------------------------------------------------------------------------
    /// @brief Appends 'New Note' menu item to Gnome's default background menu.
    ///
    /// @note  If menu already overriden, does nothing.
    ///
    apply() {
        if (this._isOverriden()) {
            return;
        }

        console.debug(`Overriding ${Main.layoutManager._bgManagers.length} background menu(s)`);

        // since additional entries are assumed to be the same in all contexts, menu override is repeated for each background manager available (monitors?)
        for (const background of Main.layoutManager._bgManagers) {
            this._background_menu = background.backgroundActor._backgroundMenu;

            // @todo add setting to enable icon on context menu?
            // this._new_note_menu_item = new PopupMenu.PopupImageMenuItem(_('New Note'), _('view-pin-symbolic'));  // icon before text
            this._new_note_menu_item = new PopupMenu.PopupMenuItem(_('New Note'));
            this._new_note_menu_item.add_child(new St.Label({ text: null, x_expand: true, x_align: Clutter.ActorAlign.CENTER }));
            this._new_note_menu_item.add_child(new St.Icon({ icon_name: 'window-new-symbolic', style_class: 'popup-menu-icon', x_align: Clutter.ActorAlign.FILL }));  // alternatives: 'list-add-symbolic' and 'view-pin-symbolic'

            this._separator_menu_item = new PopupMenu.PopupSeparatorMenuItem();

            // bind 'new note' callback
            this._on_new_note = this._new_note_menu_item.connect('activate', (_, event) => {
                // console.debug(this.constructor.name + `: creating new note @ (${coords[0]},${coords[1]})`);
                const coords = event.get_coords();
                this._sticky_notes.new(coords);
            });

            // & add to background menu
            this._background_menu.addMenuItem(this._separator_menu_item, 0);
            this._background_menu.addMenuItem(this._new_note_menu_item, 0);
        }
    }

    //--------------------------------------------------------------------------
    /// @brief Reverts Gnome's default background menu to default state / removes override.
    ///
    /// @note  If menu on default state, does nothing.
    ///
    revert() {
        if (!this._isOverriden()) {
            return;
        }

        console.debug('Reverting background menu');

        this._new_note_menu_item?.destroy();
        this._separator_menu_item?.destroy();
        this._background_menu = null;

        safe_disconnect(this._settings, this._on_settings_change_id);
        safe_disconnect(this._sticky_notes, this._on_active_change_id);
        safe_disconnect(Main.layoutManager, this._on_monitors_changed_id);
        safe_disconnect(Main.layoutManager, this._on_startup_complete_id);
        safe_disconnect(Main.sessionMode, this._on_session_mode_updated_id);
        safe_disconnect(Main.screenShield, this._on_locked_changed_id);
        safe_disconnect(Main.screenShield, this._on_active_changed_id);
        safe_disconnect(Main.screenShield, this._on_wake_up_screen_id);
    }
});
