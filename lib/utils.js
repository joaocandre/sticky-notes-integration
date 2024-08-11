import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

//------------------------------------------------------------------------------
/// @brief Class implementing a self-disconnecting signal connection.
///
/// @note Useful for one-time connections in a static context e.g. use callback on next emission only.
///       Connection is maintained until callback returns true / >0
///
export class ShortConnection {
    //--------------------------------------------------------------------------
    /// @brief Constructs a new instance.
    ///
    /// @param      {GObject}   object             Object emitting signal.
    /// @param      {String}    detailed_signal    Detailed signal name.
    /// @param      {Function}  callback           Callback function.
    ///                                            Should return true for diconnection, otherwise it will remain connected to given signal.
    /// @param      {String}    [fname='connect']  Name of the connection function e.g. 'connect', 'connect_after'
    ///
    constructor(object, detailed_signal, callback, fname='connect') {
        if (!object) {
            throw 'Invalid object';
        }
        this._object = object;
        this._handler_id = object[fname](detailed_signal, (...args) => {
            const ret = callback(...args);
            if (ret) {
                console.debug('disconnecting! .....');
                object.disconnect(this._handler_id);
            }
        });
    }

    //--------------------------------------------------------------------------
    /// @brief Destroys ongoing connection.
    ///
    destroy() {
        this._object.disconnect(this._handler_id);
    }
}

//------------------------------------------------------------------------------
/// @brief Utility wrapper around ShortConnection constructor, for consistency with GObject syntax i.e. connect(...), connect_after(...).
///
/// @param      {Array}            args    Arguments forwarded to ShortConnection constructor.
///
/// @return     {ShortConnection}  ShortConnection instance holding handler id.
///
export function connect_until(...args) {
    return new ShortConnection(...args);
}

//------------------------------------------------------------------------------
/// @brief Simple wrapper around 'disconnect' calls that checks and nullifies handler id.
///
/// @param      {Number}      handler_id  The handler identifier.
/// @param      {GObject}     instance    GObject or derived instance to disconnect from.
///
/// @return     {Boolean}     True on sucessful disconnect, false otherwise.
///
export function safe_disconnect(handler_id, instance) {
    if (handler_id) {
        try {
            instance.disconnect(handler_id);
            handler_id = null;

        } catch (error) {
            return false;
        }
    }

    return true;
}

//------------------------------------------------------------------------------
/// @brief Executes given *command* as a subprocess (asynchronously) returning exit status and printing stdout and stderr to DEBUG console.
///
/// @param      {String}  command  Command to execute.
///
/// @return     {Number}           Exit status.
///
/// @todo  Review implementation, not asynchronous at the moment
///
export function execute_async(command, output = null) {
    const launcher = new Gio.SubprocessLauncher({
        flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
    });

    const [ valid, parsed_command ] = GLib.shell_parse_argv(command);
    if (!valid) {
        throw 'Error parsing command: ' + command;
    };

    try {
        console.debug('Launching subprocess with \'' + command + '\'');
        const proc = launcher.spawnv(parsed_command);

        proc.communicate_utf8_async(null, null, (proc, res) => {
            const [, stdout, stderr] = proc.communicate_utf8_finish(res);
            proc.wait(null);
            const exit = proc.get_exit_status();
            if (stdout || stderr) {
                console.debug('[' + command + `] ${stdout || stderr}`);
            } else {
                console.debug('[' + command + `] completed with exit code: ${exit}`);
            }
            return exit;
        });
    } catch (error) {
        console.debug('[' + command + `] failed with error '${error.message}'`);
        throw error;
    }

    return 0;
}

//------------------------------------------------------------------------------
/// @brief Execute given *command* and return command line output (stdout or stderr)
///
/// @param      {String}  command  Command to execute.
///
/// @return     {String}  Command CLI output (null on error).
///
export function execute(command) {
    try {
        const [ok, out, err, exit] = GLib.spawn_command_line_sync(command);

        // convert/decode out stream to UTF-8
        const out_str = new TextDecoder().decode(out);
        return out_str;

    } catch (error) {
        return null;
    }
}

//--------------------------------------------------------------------------
/// @brief Determines if given *name* command is available
///
/// @param      {String}   name  Command name.
///
/// @return     {Boolean}  True if given 'name' command is in PATH, False otherwise.
///
export function is_available(name) {
    return Boolean(GLib.find_program_in_path(name));
}

//------------------------------------------------------------------------------
/// @brief Finds first available command/executable from given possibilities
///
/// @param      Commands/executable  [from=[]]  The from
/// @return     {string}  { description_of_the_return_value }
///
/// @note       Wraps around is_available to find executables available on system's path.
///
export function first_available(commands = []) {
    for (var i = commands.length - 1; i >= 0; i--) {
        if (is_available(commands[i])) {
            return commands[i];
        }
    }

    return null;
}

//--------------------------------------------------------------------------
/// @brief Check if automatic start is enabled for given *name* application.
///
/// @param      {String}   name  Command name. Assumes desktop file to be <name>.desktop.
///
/// @nore  Assumes user-specific autostart files in '~/.config/autostart'
///
export function get_autostart(name) {
    const file = Gio.File.new_for_path(GLib.get_home_dir() + '/.config/autostart/' + name + '.desktop');

    return file.query_exists(null);
}

//--------------------------------------------------------------------------
/// @brief Enables/disables automatic start at login.
///
/// @param      {String}   name           Command name. Assumes desktop file to be <name>.desktop.
/// @param      {Boolean}  [enable=true]  True to enable auto-start, False to disable it.
///
/// @nore  Assumes system desktop files to be under '/usr/share/applications' and user-specific autostart files in '~/.config/autostart'
///
/// @todo  Implement asynchronously, even though .desktop file has minimal size and operation is not complex/has little to no overhead.
///
export function set_autostart(name, enable = true) {
    const source = Gio.File.new_for_path('/usr/share/applications/' + name + '.desktop');
    const target = Gio.File.new_for_path(GLib.get_home_dir() + '/.config/autostart/' + name + '.desktop');

    try {
        if (enable) {
            return source.copy(target, Gio.FileCopyFlags.OVERWRITE, null, null);
        } else {
            return target.delete(null);
        }
    } catch (error) {
        if (error != Gio.IOErrorEnum.EXISTS) {
            console.debug(error);
        }
    }
}
