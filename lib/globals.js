import { execute, first_available } from './utils.js';

//------------------------------------------------------------------------------
/// Gets Sticky Notes version.
///
/// @return     {string}  Version (as <major>.<minor>.<patch>).
///
function get_version() {
    let cmd = first_available(['com.vixalien.sticky', 'com.vixalien.st', /* ... */]);
    if (cmd) {
        let ver = execute(cmd + ' -v').split('\n')[0]; // .slice(0, 6);
        if (ver.length < 10 /* hard threshold */) {
            return ver;
        }
    }

    return '';
}

//------------------------------------------------------------------------------
/// @brief General purpose application info.
///
/// @todo  Rename to StickyNotesInfo.
///
export const AppInfo = Object.freeze({
    'id'        : 'com.vixalien.sticky',
    'process'   : first_available(['com.vixalien.sticky', 'com.vixalien.st', /* ... */]),
    'icon-name' : 'com.vixalien.sticky',
    'wm-class'  : 'com.vixalien.sticky',
    // @todo implement asynchronously, may hang when initialization
    //       alternatively, check if SHELL_DEBUG is defined and use a dummy
    'version'   : get_version(),
    // @todo parse console message instead
    'note-path' : '.local/share/com.vixalien.sticky/notes',
});

//------------------------------------------------------------------------------
/// @brief Visibility types, used in preferences, background menu override and panel indicator implementations.
///
export const Visibility = Object.freeze({
    'Never'  : 0,
    'Dynamic': 1,
    'Always' : 2
});

//------------------------------------------------------------------------------
/// @brief Panel position enumerator, used in preferences and panel indicator implementations.
///
export const PanelPosition = Object.freeze({
    'Left'   : 0,
    'Center' : 1,
    'Right'  : 2
});

//------------------------------------------------------------------------------
/// @brief App action enumerator, used in preferences and panel indicator implementations.
///
export const StickyNotesAction = Object.freeze({
    'None'      : 0,
    'Toggle'    : 1,
    'Show All'  : 2,
    'Show Last' : 3,
    'Cycle'     : 4,
    'Hide All'  : 5,
    'New Note'  : 6,
    // 'Spread':  7,    // @todo not yet implemented
    'Stack'     : 8,
    // 'All Notes': 9,  // @todo not yet implemented
    'Launch'    : 10,
    'Quit'      : 11,
    // ...
});

//------------------------------------------------------------------------------
/// @brief Indicator trigger/event specifier (as settings in extension schema), used in preferences and panel indicator implementations.
///
export const TriggerKey = Object.freeze({
    'Left Button Press'   : 'left-button-press-action',
    'Middle Button Press' : 'middle-button-press-action',
    'Right Button Press'  : 'right-button-press-action',
    'Scroll Up'           : 'scroll-up-action',
    'Scroll Down'         : 'scroll-down-action'
});
