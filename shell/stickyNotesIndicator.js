import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { AppInfo, Visibility, PanelPosition, StickyNotesAction, TriggerKey } from '../lib/globals.js';

//------------------------------------------------------------------------------
/// @brief Class implementing a panel indicator for managing Sticky Notes.
///
/// @note   Registered as GObject.Object
///
export const StickyNotesIndicator = GObject.registerClass({
    GTypeName: 'StickyNotesIndicator'
}, class StickyNotesIndicator extends PanelMenu.Button {
    //--------------------------------------------------------------------------
    /// @brief  Initializes the panel indicator.
    ///
    /// @param      {Extension}             extension     Extension instance (to fetch settings and metadata).
    /// @param      {StickyNotesInterface}  sticky_notes  App interface instance.
    ///
    _init(extension, sticky_notes) {
        super._init(0.0, _('StickyNotesIndicator'));

        this._extension = extension;
        this._settings = this._extension.getSettings();
        this._sticky_notes = sticky_notes;

        // initialize empty indicator
        this._icon = new St.Icon({ gicon: null, style_class: 'system-status-icon' });
        this._label = new St.Label({
            text: null,
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._box = new St.BoxLayout({
            vertical: false,
            style_class: 'panel-status-menu-box' });
        this._box.add_child(this._icon);
        this._box.add_child(this._label);
        this.add_child(this._box);
        this._icon.visible = false;
        this._label.visible = false;

        // active menu section
        this._active_menu = new PopupMenu.PopupMenuSection();
        this._active_menu.addAction('Show All', this._sticky_notes.show.bind(this._sticky_notes));
        this._active_menu.addAction('Show Last', this._sticky_notes.show.bind(this._sticky_notes, 1));
        this._active_menu.addAction('Hide', this._sticky_notes.hide.bind(this._sticky_notes));
        this._active_menu.addAction('Stack', this._sticky_notes.stack.bind(this._sticky_notes));
        this._active_menu.addAction('Quit', this._sticky_notes.close.bind(this._sticky_notes));

        // inactive menu section
        this._inactive_menu = new PopupMenu.PopupMenuSection();
        const msg = this._inactive_menu.addAction('not running!', null);
        msg.sensitive = false;
        this._inactive_menu = new PopupMenu.PopupMenuSection();
        this._inactive_menu.addAction('Launch', this._sticky_notes.launch.bind(this._sticky_notes));

        // build menu
        this.menu.addAction('New Note', this._sticky_notes.new.bind(this._sticky_notes));
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());  // ------------
        this.menu.addMenuItem(this._active_menu);
        this.menu.addMenuItem(this._inactive_menu);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());  // ------------
        this.menu.addAction(_('Preferences'), () => this._extension.openPreferences());

        // initialize quick action bindings
        this._bindings = { };
        for (const key of Object.values(TriggerKey)) {
            this._bindAction(key);
            this._settings.connect('changed::' + key, this._bindAction.bind(this, key));
        }
        this._last_event = null;
        this._button_press_handler_id = this.connect('button-press-event', this._onButtonPress.bind(this));
        this._scroll_handler_id = this.connect('scroll-event', this._onScroll.bind(this));

        // initial update
        this._loadIcons();
        this._updateIcon();
        this._updateLabel();
        this._updateMenu();
        this._updatePosition();
        this._updateVisibility();

        // update/load indicator icon on change to active status or changes in 'use-builtin-icon' setting respectively
        this._sticky_notes.connect('notify::active', this._updateIcon.bind(this));
        this._settings.connect('changed::use-builtin-icon', this._loadIcons.bind(this));

        // update indicator label on change to active status or changes in 'use-builtin-icon' setting
        this._sticky_notes.connect('notify::n-windows', this._updateLabel.bind(this));
        this._settings.connect('changed::show-open-note-count', this._updateLabel.bind(this));

        // update menu entries on change to active status
        this._sticky_notes.connect('notify::active', this._updateMenu.bind(this));

        // update indicator position in panel on change in 'panel-indicator-position' setting
        this._settings.connect('changed::panel-indicator-position', this._updatePosition.bind(this));
        this._settings.connect('changed::panel-indicator-position-order', this._updatePosition.bind(this));

        // update indicator visibility on change in 'show-panel-indicator' settting
        this._sticky_notes.connect('notify::active', this._updateVisibility.bind(this));
        this._settings.connect('changed::show-panel-indicator', this._updateVisibility.bind(this));
    }

    //--------------------------------------------------------------------------
    /// @brief Enables the indicator i.e. adds to Gnome panel, with given *uuid*.
    ///
    enable() {
        Main.panel.addToStatusArea(this._extension.uuid, this);
    }

    //--------------------------------------------------------------------------
    /// @brief Loads/assigns/caches icons for active and inactive indicator according to extension preferences.
    ///
    /// @todo  Consider merging with _updateIcon for simplicity (?) although it may imply a bigger overhead if icons are being loaded locally
    ///
    _loadIcons() {
        // console.debug(`Loading ${this.constructor.name} icon`);

        if (this._settings.get_boolean('use-builtin-icon')) {
            this._active_icon = Gio.icon_new_for_string(this._extension.dir.get_child('icons').get_path() + "/window-pin.svg");
            this._inactive_icon = Gio.icon_new_for_string(this._extension.dir.get_child('icons').get_path() + "/window-unpin.svg");
        } else {
            this._active_icon = Gio.icon_new_for_string("view-pin-symbolic");
            this._inactive_icon = Gio.icon_new_for_string("view-pin-symbolic");
        }

        this._updateIcon();
    }

    //--------------------------------------------------------------------------
    /// @brief Updates indicator icon
    ///
    _updateIcon() {
        // console.debug(`Updating ${this.constructor.name} icon`);

        if (this._sticky_notes.active) {
            this._icon.set_gicon(this._active_icon);
        } else {
            this._icon.set_gicon(this._inactive_icon);
        }

        this._icon.visible = true;
    }

    //--------------------------------------------------------------------------
    /// @brief Updates indicator label
    ///
    _updateLabel() {
        // console.debug(`Updating ${this.constructor.name} label`);

        if (this._settings.get_boolean('show-open-note-count') && this._sticky_notes.active) {
            this._label.set_text(String(this._sticky_notes.n_windows));
            this._label.visible = true;
            return;
        }

        this._label.set_text(null);
        this._label.visible = false;
    }

    //--------------------------------------------------------------------------
    /// @brief Updates indicator menu entries
    ///
    _updateMenu() {
        // console.debug(`Updating ${this.constructor.name} menu [active: ${this._sticky_notes.active}]`);

        this._active_menu.actor.visible = this._sticky_notes.active;
        this._inactive_menu.actor.visible = !this._sticky_notes.active;
    }

    //--------------------------------------------------------------------------
    /// @brief Updates indicator position in panel
    ///
    /// @note  Only works after enable() has been called.
    ///
    _updatePosition() {
        // console.debug(`Updating ${this.constructor.name} position`);

        const position = this._settings.get_int('panel-indicator-position');
        const order = this._settings.get_int('panel-indicator-position-order');

        let box = null;
        switch (position) {
            case PanelPosition['Left']:
                box = Main.panel._leftBox;
                break;
            case PanelPosition['Center']:
                box = Main.panel._centerBox;
                break;
            case PanelPosition['Right']:
                box = Main.panel._rightBox;
                break;
        }

        if (box) {
            this.container.get_parent()?.remove_child(this.container);
            box.insert_child_at_index(this.container, order ?? 0);
        }
    }

    //--------------------------------------------------------------------------
    /// @brief Updates indicator visibility
    ///
    _updateVisibility() {
        // console.debug(`Updating ${this.constructor.name} visibility [show-panel-indicator: ${this._settings.get_int('show-panel-indicator')}]`);

        const visible = this._settings.get_int('show-panel-indicator');
        if (visible === Visibility['Always'] || ((visible === Visibility['Dynamic']) && this._sticky_notes.active)) {
            this._box.visible = true;
            this._updateIcon();
            this._updateLabel();
            return;
        }

        this._icon.visible = false;
        this._label.visible = false;
        this._box.visible = false;
    }

    //--------------------------------------------------------------------------
    /// @brief Binds an action to a (mouse) trigger/event
    ///
    /// @param      {String}  trigger  Setting key describing trigger/event.
    ///
    _bindAction(trigger) {
        console.debug(`Binding ${trigger}`);

        this._bindings[trigger] = null;
        switch (this._settings.get_int(trigger)) {
            case StickyNotesAction['Toggle']:
                this._bindings[trigger] = () => this._sticky_notes.toggle();
                break;
            case StickyNotesAction['Show All']:
                this._bindings[trigger] = () => this._sticky_notes.show();
                break;
            case StickyNotesAction['Show Last']:
                this._bindings[trigger] = () => this._sticky_notes.show(1);
                break;
            case StickyNotesAction['Cycle']:
                this._bindings[trigger] = () => this._sticky_notes.show(1, false);
                break;
            case StickyNotesAction['Hide All']:
                this._bindings[trigger] = () => this._sticky_notes.hide();
                break;
            case StickyNotesAction['New Note']:
                this._bindings[trigger] = () => this._sticky_notes.new();
                break;
            // case StickyNotesAction['Spread']:
            //     this._bindings[trigger] = () => this._sticky_notes.spread();
            //     break;
            case StickyNotesAction['Stack']:
                this._bindings[trigger] = () => this._sticky_notes.stack();
                break;
            // case StickyNotesAction['All Notes']:
            //     this._bindings[trigger] = () => this._sticky_notes.all();
            //     break;
            case StickyNotesAction['Launch']:
                this._bindings[trigger] = () => this._sticky_notes.launch();
                break;
            case StickyNotesAction['Quit']:
                this._bindings[trigger] = () => this._sticky_notes.close();
                break;
        }

    }

    //----------------------------------------------------------------------
    /// @brief Callback for mouse button presses.
    ///
    /// @param      {Clutter.Actor::button_press_event}  event   Triggered button press event.
    ///
    _onButtonPress(_, event) {
        // filter consecutive/duplicate events (happens occasionally)
        // @todo add threshold as parameter (?)
        if (this._last_event && event.get_time() - this._last_event < 200 /* ms threshold between consecutive presses */) {
            console.debug('ignoring button press !!!!!');
            return;
        }

        console.debug('button press !!!!!');

        const menu_override = (action) => {
            if (action) {
                this.menu.close();
                action();
            }
        };

        switch (event.get_button()) {
            case Clutter.BUTTON_PRIMARY:
                menu_override(this._bindings[TriggerKey['Left Button Press']]);
                break;
            case Clutter.BUTTON_MIDDLE:
                menu_override(this._bindings[TriggerKey['Middle Button Press']]);
                break;
            case Clutter.BUTTON_SECONDARY:
                menu_override(this._bindings[TriggerKey['Right Button Press']]);
                break;
        }

        this._last_event = event.get_time();
    }

    //----------------------------------------------------------------------
    /// @brief Callback for mouse scroll events.
    ///
    /// @param      {Clutter.Actor::button_press_event}  event   Triggered scroll event.
    ///
    _onScroll(_, event) {
        switch (event.get_scroll_direction()) {
            case Clutter.ScrollDirection.UP:
                this._bindings[TriggerKey['Scroll Up']]();
                break;
            case Clutter.ScrollDirection.DOWN:
                this._bindings[TriggerKey['Scroll Down']]();
                break;
        }

        this._last_event = event.get_time();
    }
});
