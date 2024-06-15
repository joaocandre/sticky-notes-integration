import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import { MultiWindowHandler } from './multiWindowHandler.js';
import { AppInfo } from '../lib/globals.js';
import { execute_async, safe_disconnect } from '../lib/utils.js';

//------------------------------------------------------------------------------
/// @brief Class that provides a simple programatic interface to manage Sticky Notes.
///        Useful to abstract extension code from window management / lower-level implementations.
///
/// @note  Extends MultiWindowHandler (by composition), for 'Sticky Notes'-specific usage.
///
export const StickyNotesInterface = GObject.registerClass({
    GTypeName: 'StickyNotesInterface',
    Properties: {
        'active': GObject.ParamSpec.boolean(
            'active', 'active', 'Status of Sticky Notes',
            GObject.ParamFlags.READABLE, false
        ),
        'n-windows': GObject.ParamSpec.uint64(
            'n-windows', 'n-windows', 'Number of open Sticky Notes',
            GObject.ParamFlags.READABLE, 0
        ),
    },
    // @see https://docs.gtk.org/gobject/concepts.html#signal-emission
    Signals: {
        'window-opened': { param_types: [ Meta.Window /* not working */ ],
                           flags: GObject.SignalFlags.RUN_LAST },
    },
}, class StickyNotesInterface extends GObject.Object {
    //--------------------------------------------------------------------------
    /// @brief Command used to launch 'Sticky Notes'.
    ///
    /// @type       {String}
    ///
    static get _LAUNCH_CMD() { return AppInfo['process']; }

    //--------------------------------------------------------------------------
    /// @brief Command used to create a new note.
    ///
    /// @type       {String}
    ///
    static get _NEWNOTE_CMD() { return AppInfo['process'] + ' -n'; }

    //--------------------------------------------------------------------------
    /// Constructs a new instance.
    ///
    constructor(extension) {
        super();

        this._settings = extension.getSettings();

        this._n_windows = 0;
        this.refresh();

        this._shell_tracker_id = null;
        this._display_tracker_id = null;

        this._keep_alive = this._settings.get_boolean('keep-alive');
        this._settings.connect('changed::keep-alive', (settings, key) => {
             this._keep_alive = settings.get_boolean(key);
             console.debug(`${key} = ${settings.get_value(key).print(true)}`);
        });

        this._launch_lock = false;
        this._launch_tasks = [];
    }

    //--------------------------------------------------------------------------
    /// @brief Signal-based implementation, which may be faster and more efficient than continuously polling process & window list
    ///        and does not require any parametrization.
    ///
    /// @note  Different signals can achive same end results, as long as emitted on app launch/close.
    ///        From logs, 'xdg-desktop-portal' catches 'running-applications-changed' from gnome-shell, which may be a good candidate for tracking app state.
    ///
    track() {
        // Shell.WindowTracker emits signals on window updates
        // @see https://gnome.pages.gitlab.gnome.org/gnome-shell/shell/class.WindowTracker.html
        // this._shell_tracker_id = Shell.WindowTracker.get_default().connect('notify::focus-app', this.refresh.bind(this));   // alternative: 'tracked-windows-changed'
        this._shell_tracker_id = Shell.AppSystem.get_default().connect('app-state-changed', this.refresh.bind(this));

        // alternatively, Meta.Display class allows more granular control, although w/ more redundant calls
        // @see  https://gnome.pages.gitlab.gnome.org/mutter/meta/signal.Display.html
        this._display_tracker_id = global.display.connect_after('restacked', this.refresh.bind(this));  // alternatives: 'focus-window', 'notify::focus-window'

        console.debug(this.constructor.name + ': tracking active status');

        return true;
    }

    //--------------------------------------------------------------------------
    /// @brief Stops tracking of 'Sticky Notes' status.
    ///
    untrack() {
        safe_disconnect(Shell.AppSystem.get_default(), this._shell_tracker_id);
        safe_disconnect(global.display, this._display_tracker_id);

        console.debug(this.constructor.name + ': stopped tracking active status');

        return true;
    }

    //--------------------------------------------------------------------------
    /// @brief Updates 'Static Notes' active status and emits signals accordingly.
    ///
    refresh() {
        // @todo filter out main window (if open)
        //       not straightforward to do through Mutter as main window has the same metadata as notes
        const n_windows = MultiWindowHandler.count(AppInfo['wm-class']);
        if (this._n_windows == n_windows) {
            return;
        }

        // for each new window, emit a 'window-opened' signal and pass Meta.Window object
        // @todo window isn't being passed properly ('undefined' on connected callbacks)
        const wdiff = n_windows - this._n_windows;
        if (wdiff) {
            const windows = MultiWindowHandler.get(AppInfo['wm-class'], wdiff, true);
            for (const window of windows) {
                this.emit('window-opened', window);
            }
        }
        this._n_windows = n_windows;
        this.notify('n-windows');
        this.notify('active');

        if (this.active) {
            console.debug(this.constructor.name + ` is active [${this._n_windows}]`);
        } else {
            console.debug(this.constructor.name + ' is inactive');
            // force a restart if 'keep-alive'
            // only applied when closing app, in order to not cause conflict with 'auto-start' setting and if not creating a new note (which requires closing the app)
            if (this._keep_alive && !this._launch_lock) {
                console.debug(this.constructor.name + `: restarting [keep-alive: ${this._keep_alive}]`);
                this.launch();
                // for unobtrusiveness ('close' is assumed to be user-requested), notes are kept hidden on re-launch
                // @todo add setting to enable/disable this
                this._launch_tasks.push(this.hide.bind(this));
                // // alternative implementation (bypassing default handler)
                // this._launch_task_id = this.connect_after('window-opened', () => { this.hide(); safe_disconnect(this, this._launch_task_id); } );
            }
        }

        return true;
    }

    //--------------------------------------------------------------------------
    /// @brief 'window-opened' signal default handler, called when a new window Sticky Notes window opened.
    ///
    /// @param      {Meta.Window}  window    Window instance associated with opened window/note.
    ///
    /// @note   Used to lock launch commands during start-up (required e.g. when creating a new note with 'keep-alive' setting enabled, see new())
    ///         and generally to schedule tasks to execute on launch
    ///
    on_window_opened(_, window) {
        for (const func of this._launch_tasks) {
            try {
                func();
            } catch (error) {
                console.debug('\n\n' + error + '\n\n');
            }
        }

        // clear launch flag & tasks
        this._launch_lock = false;
        this._launch_tasks.length = 0;  // @see https://stackoverflow.com/a/1232046

        console.debug(this.constructor.name + `: window-opened`);
    }

    //--------------------------------------------------------------------------
    /// @brief Get active status of Sticky Notes.
    ///
    /// @type       {bool}  True if running (i.e. at least a window is opened), false otherwise.
    ///
    get active() {
        return Boolean(this._n_windows);
    }

    //--------------------------------------------------------------------------
    /// @brief Get number of open Sticky Notes windows.
    ///
    /// @type       {bool}  True if running, false otherwise.
    ///
    /// @todo   Rename to nWindows?
    ///
    get n_windows() {
        return this._n_windows;
    }

    //--------------------------------------------------------------------------
    /// @brief Launches/starts 'Sticky Notes'.
    ///
    /// @return     {Boolean}   True if launch command exited sucessfully, false otherwise.
    ///
    launch() {
        if (this._launch_lock) {
            return;
        }

        const exit = execute_async(StickyNotesInterface._LAUNCH_CMD);
        this._launch_lock = !Boolean(exit);

        if (!exit) {
            console.debug(this.constructor.name + `: Launched application`);
        }
        return !Boolean(exit);
    }

    //--------------------------------------------------------------------------
    /// @brief Creates a new (empty) note.
    ///
    /// @param      {Array}   [at=[]]      Coordinates to place new note at, as *[col, row]*.
    ///
    /// @note       Sticky Notes CLI does not allow creating a new note while the app is running;
    ///             Current workaround is to exit app (close all notes) and launch with '-n' argument to create a new note.
    ///             Ideally, this would be fixed upstream by updating app's CLI.
    ///
    /// @note       Alternative implementation:
    ///             1) from a Meta.Window instance, get titlebar and activate '+' Gtk.Widget directly (button.emit('activated')...)
    ///             2) use Shel.App.activate_action('new') or similar
    ///                cf. https://gnome.pages.gitlab.gnome.org/gnome-shell/shell/method.App.activate_action.html
    ///
    new(at = []) {
        if (this._launch_lock) {
            return;
        }
        if (this.active) {
            this.close();
        }

        const exit = execute_async(StickyNotesInterface._NEWNOTE_CMD);
        this._launch_lock = !Boolean(exit);

        /// @note when coordinates are provided, move next window there through 'window-open' default handler (this._launch_tasks).
        ///       alternatively, connecting to any signal emitted on a new window ('window-created', 'window-entered-monitor', etc) would work.
        ///
        if (!exit && at && at?.length === 2) {
            this._launch_tasks.push(MultiWindowHandler.moveTo.bind(null, AppInfo['wm-class'], at[0], at[1]));
        }

        if (!exit) {
            console.debug(this.constructor.name + `: new note`);
        }
        return !Boolean(exit);
    }

    //--------------------------------------------------------------------------
    /// @brief Shows (brings to front) *n* notes/windows.
    ///
    /// @param      {number}   [n=0]                Number of windows to show.
    /// @param      {boolean}  [newer_first=false]  Wether to show newer windows first.
    ///
    show(n = 0, newer_first = true) {
        const wcount = MultiWindowHandler.activate(AppInfo['wm-class'], n, newer_first);

        if (wcount) {
            console.debug(this.constructor.name + `: shown ${wcount} notes`);
        }
        return Boolean(wcount);
    }

    //--------------------------------------------------------------------------
    /// @brief Hides (minimizes) *n* notes/windows.
    ///
    /// @param      {number}   [n=0]                Number of windows to hide.
    /// @param      {boolean}  [newer_first=false]  Wether to hide newer windows first.
    ///
    hide(n = 0, newer_first = true) {
        const wcount = MultiWindowHandler.minimize(AppInfo['wm-class'], n, newer_first);

        if (wcount) {
            console.debug(this.constructor.name + `: hid ${wcount} notes`);
        }
        return Boolean(wcount);
    }

    //--------------------------------------------------------------------------
    /// @brief Close *n* notes/windows.
    ///
    /// @param      {number}   [n=0]                Number of windows to close.
    /// @param      {boolean}  [newer_first=false]  Wether to close newer windows first.
    ///
    /// @todo   Add parameter to also kill underlying proccess?
    ///
    close(n = 0, newer_first = true) {
        const wcount = MultiWindowHandler.kill(AppInfo['wm-class'], n, newer_first);

        if (wcount) {
            console.debug(this.constructor.name + `: closed ${wcount} notes`);
        }
        return Boolean(wcount);
    }

    //--------------------------------------------------------------------------
    /// @brief Shows/hides notes/windows according to active/minimized status, respectively.
    ///
    toggle() {
        if (MultiWindowHandler.count(AppInfo['wm-class'], true)) {
            this.hide();
        } else {
            this.show();
        }
    }

    //--------------------------------------------------------------------------
    /// @brief Stacks all open notes at given coordinates *(x,y)* on primary monitor.
    ///
    /// @param      {number}  [x=20]  Coordinates (pixel column #)
    /// @param      {number}  [y=50]  Coordinates (pixel row #)
    ///
    /// @note       Stack position default to upper left corner.
    ///
    stack(x = 20, y = 50) {
        const wcount = MultiWindowHandler.moveTo(AppInfo['wm-class'], x, y, global.display.get_primary_monitor(), 0 /* force all windows */, true);

        console.debug(this.constructor.name + `: stacked ${wcount} notes`);
        return Boolean(wcount);
    }

    //--------------------------------------------------------------------------
    /// @brief Open Sticky Notes main window (aka 'All Notes').
    ///
    main() {
        // ...
        // @note possible upstream implementations:
        //       1) extra CLI option to open main window
        //       2) different title/wm_class on main window
        //       3) ...
        // ...
        console.debug(this.constructor.name + ": unable to open 'All Notes': feature not (yet) implemented!");

        return false;
    }

    //--------------------------------------------------------------------------
    /// @brief Show all notes on shell overview.
    ///
    /// @see 'App Spread' feature in Dash-to-dock Gnome Shell extension.
    ///
    spread() {
        // ...
        // @note possible implementations:
        //       1a) import appSpread module from dash-to-dock if available
        //       1b) use Shell.App object associated with Sticky Notes
        //       2) ...
        // ...
        console.debug(this.constructor.name + ": unable to perform 'Note Spread': feature not (yet) implemented!");

        return false;
    }

    //--------------------------------------------------------------------------
    /// @brief Kill 'Sticky Notes' process.
    ///
    /// @param      {str}  args    Kill command arguments, forwarded to *killall*. Defauls to '-q'.
    ///
    /// @note  Kills process tree directly vs closing all windows (StickyNotesInterface.close()).
    ///
    kill(args = '-q') {
        const exit = execute_async('killall ' + args + ' ' + StickyNotes.PROCESS_NAME);

        if (!exit) {
            console.debug(this.constructor.name + `: Killed application`);
        }
        return !Boolean(exit);
    }

    //--------------------------------------------------------------------------
    /// @brief Restart 'Sticky Notes'.
    ///
    restart() {
        return (StickyNotesInterface.close() || StickyNotesInterface.launch());
    }

    //--------------------------------------------------------------------------
    /// @brief Opens the default note directory.
    ///
    /// @note  Assumes XDG specification
    ///
    openNotes() {
        const exit = execute_async('xdg-open ' +  GLib.get_home_dir() + '/' + AppInfo['note-path']);

        return !Boolean(exit);
    }
});
