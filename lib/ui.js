import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';

//------------------------------------------------------------------------------
/// @brief Creates a selection box.
///
/// @param      {Gio.Settings}  settings    Extension settings.
/// @param      {String}        setting_id  Setting/parameter identifier
/// @param      {Array}         options     The options
///
/// @return     {Gtk}     { description_of_the_return_value }
///
export function createSelection(settings, setting_id, options, description = '') {
    const selection = new Gtk.ComboBoxText({
        valign: Gtk.Align.CENTER,
        tooltip_text: description,
    });
    // append options
    for (const option of options) {
        selection.append(option[0], option[1]);
    }
    // activate default
    const select_default = settings.get_int(setting_id);
    selection.set_active_id(select_default.toString());
    // connect callback to update settings
    selection.connect('changed', () => {
        settings.set_int(setting_id, parseInt(selection.get_active_id()));
    });

    return selection;
}

//------------------------------------------------------------------------------
/// @brief  Maps a dictionary with label:value elements to an array of [value, label] strings.
///         Useful to pass conventional objects to createSelection().
///
/// @param      {Dictionary}  options  Selection options, with labels as keys.
///
/// @return     {Array}  Entries in *options*, as an array of [value, label] strings.
///
export function selectFrom(options) {
    return Object.entries(options).map(([k,v]) =>  [v.toString(), k]);
}

//------------------------------------------------------------------------------
/// @brief Creates a spin button.
///
/// @param      {Gio.Settings}  settings    Extension settings.
/// @param      {String}        setting_id  Setting/parameter identifier
/// @param      {<type>}  lower             Lower value
/// @param      {<type>}  upper             Upper value
/// @param      {number}  digits            Number of digits
/// @param      {number}  increment         Stepm increment value
/// @param      {string}  [description='']  Setting description (optional).
///
/// @return     {Gtk.SpinButton}     Spin button with given adjustment configuration.
///
export function createSpinButton(settings, setting_id, lower, upper, digits, increment, description = '') {
    const adjustment = new Gtk.Adjustment({
        lower: lower,
        upper: upper,
        step_increment: increment,
        page_increment: 2 * increment,
        page_size: 0,
    });
    const button = new Gtk.SpinButton({
        adjustment: adjustment,
        sensitive: true,
        digits: digits,
        width_chars: digits, // + 1,
        tooltip_text: description,
        valign: Gtk.Align.CENTER,
    });
    button.wrap = true;
    button.set_range(lower, upper);
    button.connect(
        "value-changed",
        function (button) {
            var value = button.get_value();
            settings.set_int(setting_id, value);
        }.bind(this)
    );
    settings.bind(setting_id, button, 'value', Gio.SettingsBindFlags.DEFAULT);

    return button;
}

//------------------------------------------------------------------------------
/// @brief Creates an image box.
///
/// @param      {String}  image        Name of the image to load (e.g. icon specificer)
/// @param      {String}  label        Label to place *below* the image
/// @param      {String}  description  Description string to place *below* image and label.
///
/// @return     {Gtk.Box}     Box instance w/ image.
///
export function createImageBox(image, label, description = '') {
    const image_box = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        margin_top: 10,
        margin_bottom: 10,
        tooltip_text: label,
        hexpand: false,
        vexpand: false,
    });
    const image_widget = new Gtk.Image({
        margin_bottom: 15,
        icon_name: image,
        pixel_size: 100,
    });
    const label_widget = new Gtk.Label({
        label: `<span size="large"><b>${label}</b></span>`,
        use_markup: true,
        vexpand: true,
        valign: Gtk.Align.FILL,
    });
    const description_widget = new Gtk.Label({
        label: description,
        hexpand: false,
        vexpand: false,
        margin_bottom: 5,
    });
    image_box.append(image_widget);
    image_box.append(label_widget);
    image_box.append(description_widget);

    return image_box;
}

//------------------------------------------------------------------------------
/// @briefs Creates a generic 'no warranty' disclaimer referring to given *license*.
///
/// @param      {<type>}  licence  License name  e.g. 'GNU General Public License, version 2 or later'.
/// @param      {string}  url      License URL.
///
/// @return     {Gtk.Box}     Box with/ disclaumer text.
///
export function createLicenseDisclaimer(license, url) {
    //
    const warranty = 'This program comes with absolutely no warranty.';
    const reference = ('See the %s' + license + '%s for details.').format('<a href="' + url + '">', '</a>');

    const license_disclaimer = new Gtk.Label({
        label: `<span size="small">${warranty}\n${reference}</span>`,
        use_markup: true,
        justify: Gtk.Justification.CENTER,
    });

    const licence_box = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        valign: Gtk.Align.END,
        vexpand: true,
        margin_top: 5,
        margin_bottom: 10,
    });

    licence_box.append(license_disclaimer);

    return licence_box;
}

//------------------------------------------------------------------------------
/// @brief Adds a conventional settings row for selection between multiple keys.
///
/// @param      {Adw.PreferencesGroup}  group     Settings group to add row to.
/// @param      {String}                title     Title/name of the setting.
/// @param      {String}                subtitle  Subtitle/description of the setting.
/// @param      {Array}                 args      Arguments forwarded to createSelection(..args).
///                                               inc. 'settings', 'setting_id' and 'options'
///
/// @return     {Adw.ActionRow}         New settings row.
///
export function addSelectionRow(group, title, subtitle, settings, setting_id, options, extra = [ ]) {
    const row = new Adw.ActionRow({
        title: title,
        subtitle: subtitle,
        // icon_name: 'view-pin-symbolic'
    });
    const selection = createSelection(settings, setting_id, options, subtitle);
    for (const element of extra) {
        row.add_suffix(element);
    }
    row.add_suffix(selection);
    group.add(row);

    return row;
}

//------------------------------------------------------------------------------
/// @brief Adds a conventional settings row for ON/OFF settings.
///
/// @param      {Adw.PreferencesGroup} group       Settings group to add row to.
/// @param      {String}               title       Title/name of the setting.
/// @param      {String}               subtitle    Subtitle/description of the setting.
/// @param      {Gio.Settings}         settings    Extension settings.
/// @param      {String}               setting_id  Name of the setting (as defined in schema file).
///
/// @return     {Adw.ActionRow}        New settings row.
///
export function addToggleRow(group, title, subtitle, settings, setting_id) {
    const row = new Adw.SwitchRow({
        title: title,
        subtitle: subtitle,
    });
    group.add(row);
    settings.bind(setting_id, row, 'active', Gio.SettingsBindFlags.DEFAULT);

    return row;
}

//------------------------------------------------------------------------------
/// @brief Adds an information row.
///
/// @param      {Adw.PreferencesGroup} group         Settings group to add row to.
/// @param      {String}               title         Title of the information snippet.
/// @param      {String}               subtitle      Subtitle/description of the information snippet.
/// @param      {Array}                [content=[]]  Info values to append to row (as suffix)
///
/// @return     {Adw.ActionRow}        New settings row.
///
export function addRow(group, title, subtitle, content = [ ]) {
    const row = new Adw.ActionRow({
        title: title,
        subtitle: subtitle,
    });
    for (const entry of content) {
        row.add_suffix(entry);
    }
    group.add(row);

    return row;
}

//------------------------------------------------------------------------------
/// @brief Adds an error box/message to a preferences page.
///
/// @param      {Adw.PreferencesPage}  page     Page to add error to.
/// @param      {String}               message  Error message.
///
export function addErrorBox(page, message = '') {
    const group = new Adw.PreferencesGroup();
    group.add(createImageBox('dialog-error-symbolic', 'Error', message));
    group.set_sensitive(true);
    page.add(group);
}

