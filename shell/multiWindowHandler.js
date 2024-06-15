import GObject from 'gi://GObject';
import Meta from 'gi://Meta';

import { connect_until } from '../lib/utils.js';

//------------------------------------------------------------------------------
/// @brief Generic utility class to manage application windows.
///
/// @note Provides static implementations to list, activate (grab focus), minimize and close multiple windows of the same application (i.e. same WM_CLASS property).
///       High-level wrapper around Mutter/Meta API.
///
/// @note Implementation inspired by "Activate By Window Title" extension.
///       cf. https://github.com/lucaswerkmeister/activate-window-by-title/blob/main/extension.js
///
/// @todo Consider using Shell.AppSystem instead, whose functionality seems to overlap with MultiWindowHandler.
///       cf. https://gnome.pages.gitlab.gnome.org/gnome-shell/shell/class.AppSystem.html
///
export const MultiWindowHandler = GObject.registerClass({
    GTypeName: 'MultiWindowHandler',
}, class MultiWindowHandler extends GObject.Object {
    //--------------------------------------------------------------------------
    /// @brief Gets *n* windows matching given *wm_class*, in custom order.
    ///
    /// @param      {String}   wm_class             Window class property.
    /// @param      {Number}   [n=0]                Number of windows to get.
    /// @param      {Boolean}  [newer_first=false]  Whether to sort newer windows at the beginning of the returned window array.
    ///
    /// @return     {Array}    Windows (as Meta.Window).
    ///
    /// @note       Implementation inspired by "Activate By Window Title" extension.
    ///
    /// @see        https://github.com/lucaswerkmeister/activate-window-by-title/blob/main/extension.js
    ///
    static get(wm_class, n = 0, newer_first = false) {
        const windows = [];
        let wcount = 0;

        const actors = global.get_window_actors();
        if (newer_first) {
            actors.reverse();
        }
        for (const actor of actors) {
            const window = actor.get_meta_window();
            if (window.get_wm_class() === wm_class) {
                windows.push(window);
                wcount++;
                if (n && wcount >= n) {
                    break;
                }
            }
        }

        return windows;
    }

    //--------------------------------------------------------------------------
    /// @brief  Get number of windows matching given *wm_class*.
    ///
    /// @note   Simpler alternative to get().length (with slightly less overhead).
    ///
    /// @param      {String}  wm_class             The windows message class
    /// @param      {Boolean} [active_only=false]  Whether to count only active windows.
    ///
    static count(wm_class, active_only = false) {
        let wcount = 0;

        for (const actor of global.get_window_actors()) {
            const window = actor.get_meta_window();
            if (active_only && window.is_hidden()) {
                continue;
            }
            if (window.get_wm_class() === wm_class) {
                wcount++;
            }
        }

        return wcount;
    }

    //--------------------------------------------------------------------------
    /// @brief Activates *n* windows matching given *wm_class*, in custom order.
    ///
    /// @param      {String}   wm_class             Window class property.
    /// @param      {Number}   [n=0]                Number of windows to activate.
    /// @param      {Boolean}  [newer_first=false]  Wether to activare newer windows first.
    ///
    /// @return     {Boolean}  True if *at least* a window was activated, False otherwise.
    ///
    static activate(wm_class, n = 0, newer_first = false) {
        const windows = MultiWindowHandler.get(wm_class, n, newer_first);

        const activate = (window) => {
            const now = global.get_current_time();
            const workspace = window.get_workspace();
            if (workspace) {
                workspace.activate_with_focus(window, now);  // alternatively, use window.activate_with_workspace(workspace)
            } else {
                window.activate(now);
            }
        };

        windows.map((window) => { activate(window); });

        return windows.length;
    }

    //--------------------------------------------------------------------------
    /// @brief Minimizes *n* windows matching given *wm_class*, in custom order.
    ///
    /// @param      {String}   wm_class             Window class property.
    /// @param      {Number}   [n=0]                Number of windows to minimize.
    /// @param      {Boolean}  [newer_first=false]  Whether to minimize newer windows first.
    ///
    /// @return     {Boolean}  True if *at least* a window was minimized, False otherwise.
    ///
    static minimize(wm_class, n = 0, newer_first = false) {
        const windows = MultiWindowHandler.get(wm_class, n, newer_first);

        windows.map((window) => { window.minimize(); });

        return windows.length;
    }

    //--------------------------------------------------------------------------
    /// @brief Kills *n* windows matching given *wm_class*, in custom order.
    ///
    /// @param      {String}   wm_class             Window class property.
    /// @param      {Number}   [n=0]                Number of windows to minimize.
    /// @param      {Boolean}  [newer_first=false]  Whether to kill newer windows first.
    ///
    /// @return     {Boolean}  True if *at least* a window was killed, False otherwise.
    ///
    static kill(wm_class, n = 0, newer_first = false) {
        const windows = MultiWindowHandler.get(wm_class, n, newer_first);

        windows.map((window) => { window.kill(); });

        return windows.length;
    }

    //--------------------------------------------------------------------------
    /// @brief Move *n* Sticky Notes windows to givem *[x,y]* coordinates.
    ///
    /// @param      {String}   wm_class             Window class property.
    /// @param      {Number}   x                    Coordinates (pixel column #).
    /// @param      {Number}   y                    Coordinates (pixel row #).
    /// @param      {Number}   [monitor=null]       Monitor to move window to. Ignored if null.
    /// @param      {Number}   [n=1]                Number of windows to move.
    /// @param      {Boolean}  [newer_first=false]  Whether to move newer windows first.
    ///
    /// @note For convenience, moves only the newest note by default.
    ///
    static moveTo(wm_class, x, y, monitor = null, n = 1, newer_first = true) {
        const windows = MultiWindowHandler.get(wm_class, n, newer_first);

        windows.map((window) => {
            if (monitor) {
                window.move_to_monitor(monitor);
            }
            if (window.is_hidden() || !window.allows_move()) {
                MultiWindowHandler.schedule(window, 'move_frame', true, x, y);
            } else {
                window.move_frame(true, x, y);
            }
        });

        return windows.length;
    }

    //--------------------------------------------------------------------------
    /// @brief  Schedules a call to given *fname* on given *window* once the 'shown' signal is emitted.
    ///         Useful when manipulating windows before they've finished initialization.
    ///
    /// @param      {Meta.Window}  window  Window to call 'fname' on.
    /// @param      {String}       fname   Member function to call (cf. Meta.Window class)
    /// @param      {Array}        args    Arguments forwarded to *fname*
    ///
    /// @see    https://mutter.gnome.org/meta/signal.Window.shown.html
    ///
    static schedule(window, fname, ...args) {
        return connect_until(window, 'shown', (w) => {
            w[fname](...args);
            return true;
        });
    }
});
