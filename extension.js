import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { StickyNotesInterface } from './shell/stickyNotesInterface.js';
import { BackgroundMenuOverride } from './shell/backgroundMenuOverride.js';
import { StickyNotesIndicator } from './shell/stickyNotesIndicator.js';

//------------------------------------------------------------------------------
/// @brief This class describes a sticky notes integration extension.
///
export default class StickyNotesIntegrationExtension extends Extension {
    //--------------------------------------------------------------------------
    /// @brief Enables 'Sticky Notes Integration' extension.
    ///
    enable() {
        this._settings = this.getSettings();

        this._sticky_notes = new StickyNotesInterface(this);
        this._sticky_notes.track();

        this._sticky_indicator = new StickyNotesIndicator(this, this._sticky_notes);
        this._sticky_indicator.enable();

        this._background_menu = new BackgroundMenuOverride(this, this._sticky_notes);
        this._background_menu.enable();
    }

    //--------------------------------------------------------------------------
    /// @brief Disables 'Sticky Notes Integration' extension.
    ///
    disable() {
        this._settings = null;

        this._sticky_notes?.untrack();
        this._sticky_notes = null;

        this._sticky_indicator?.destroy();
        this._sticky_indicator = null;

        this._background_menu?.revert();
        this._background_menu = null;
    }
}
