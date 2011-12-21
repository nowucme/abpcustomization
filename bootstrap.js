const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

function startup(params, reason)
{
  if (Services.vc.compare(Services.appinfo.platformVersion, "10.0") < 0)
    Components.manager.addBootstrappedManifestLocation(params.installPath);

  PrefsObserver.init();
}

function shutdown(params, reason)
{
  if (Services.vc.compare(Services.appinfo.platformVersion, "10.0") < 0)
    Components.manager.removeBootstrappedManifestLocation(params.installPath);

  PrefsObserver.shutdown();
}

var PrefsObserver =
{
  branch: "extensions.abpcustomization.",

  init: function()
  {
    for (let feature in features)
      this.updateFeature(feature);

    Services.prefs.addObserver(this.branch, this, true);
  },

  shutdown: function()
  {
    for (let feature in features)
      features[feature].shutdown();

    Services.prefs.removeObserver(this.branch, this);
  },

  updateFeature: function(feature)
  {
    if (!(feature in features))
      return;

    try
    {
      let enabled = Services.prefs.getBoolPref(this.branch + feature);
      if (enabled)
        features[feature].init();
      else
        features[feature].shutdown();
    }
    catch (e) {}
  },

  observe: function(subject, topic, data)
  {
    if (topic != "nsPref:changed" || data.indexOf(this.branch) != 0)
      return;

    this.updateFeature(data.substr(this.branch.length));
  },

  QueryInterface: XPCOMUtils.generateQI([Ci.nsISupportsWeakReference, Ci.nsIObserver])
};

var WindowFeature =
{
  initialized: false,

  init: function()
  {
    if (this.initialized)
      return;
    this.initialized = true;

    let e = Services.ww.getWindowEnumerator();
    while (e.hasMoreElements())
      this.applyToWindow(e.getNext().QueryInterface(Ci.nsIDOMWindow));

    Services.ww.registerNotification(this);
  },

  shutdown: function()
  {
    if (!this.initialized)
      return;
    this.initialized = false;

    let e = Services.ww.getWindowEnumerator();
    while (e.hasMoreElements())
      this.removeFromWindow(e.getNext().QueryInterface(Ci.nsIDOMWindow));

    Services.ww.unregisterNotification(this);
  },

  applyToWindow: function(window)
  {
    if (window.location.href != this.windowUrl)
      return;
    this._applyToWindow(window);
  },

  removeFromWindow: function(window)
  {
    if (window.location.href != this.windowUrl)
      return;
    this._removeFromWindow(window);
  },

  observe: function(subject, topic, data)
  {
    if (topic == "domwindowopened")
    {
      let window = subject.QueryInterface(Ci.nsIDOMWindow);
      window.addEventListener("DOMContentLoaded", function()
      {
        if (this.initialized)
          this.applyToWindow(window);
      }.bind(this), false);
    }
  },

  QueryInterface: XPCOMUtils.generateQI([Ci.nsISupportsWeakReference, Ci.nsIObserver])
}

var VerticalPreferencesLayout =
{
  __proto__: WindowFeature,
  windowUrl: "chrome://adblockplus/content/ui/filters.xul",

  _applyToWindow: function(window)
  {
    let content = window.document.getElementById("content");
    let splitter = window.document.getElementById("filtersSplitter");
    if (!content || !splitter)
      return;

    content.setAttribute("orient", "vertical");
    splitter.setAttribute("orient", "vertical");
  },

  _removeFromWindow: function(window)
  {
    let content = window.document.getElementById("content");
    let splitter = window.document.getElementById("filtersSplitter");
    if (!content || !splitter)
      return;

    content.removeAttribute("orient");
    splitter.setAttribute("orient", "horizontal");
  }
};

var OneLineSubscriptions =
{
  __proto__: WindowFeature,
  windowUrl: "chrome://adblockplus/content/ui/filters.xul",

  _applyToWindow: function(window)
  {
    let list = window.document.getElementById("subscriptions");
    let template = window.document.getElementById("subscriptionTemplate");
    if (!list || !template || !("Templater" in window))
      return;

    let vbox = template.firstChild;
    if (!vbox || vbox.localName != "vbox")
      return;

    let hbox1 = vbox.firstChild;
    if (!hbox1 || hbox1.localName != "hbox")
      return;

    let hbox2 = hbox1.nextSibling;
    if (!hbox2 || hbox2.localName != "hbox")
      return;

    let checkboxes = hbox1.getElementsByTagName("checkbox");
    let insertionPoint = (checkboxes.length && checkboxes[0].parentNode == hbox1 ? checkboxes[0] : null);
    while (hbox2.firstChild)
    {
      hbox2.firstChild.classList.add("movedByCustomization");
      hbox1.insertBefore(hbox2.firstChild, insertionPoint);
    }

    for (let child = list.firstChild; child; child = child.nextSibling)
      window.Templater.update(template, child);
  },

  _removeFromWindow: function(window)
  {
    let list = window.document.getElementById("subscriptions");
    let template = window.document.getElementById("subscriptionTemplate");
    if (!list || !template || !("Templater" in window))
      return;

    let vbox = template.firstChild;
    if (!vbox || vbox.localName != "vbox")
      return;

    let hbox1 = vbox.firstChild;
    if (!hbox1 || hbox1.localName != "hbox")
      return;

    let hbox2 = hbox1.nextSibling;
    if (!hbox2 || hbox2.localName != "hbox")
      return;

    let moved = [].slice.call(hbox1.getElementsByClassName("movedByCustomization"));
    for (let i = 0; i < moved.length; i++)
    {
      moved[i].classList.remove("movedByCustomization");
      hbox2.appendChild(moved[i]);
    }

    for (let child = list.firstChild; child; child = child.nextSibling)
      window.Templater.update(template, child);
  }
};

var StylesheetFeature =
{
  initialized: false,
  stylesheetService: Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService),

  init: function()
  {
    if (this.initialized)
      return;
    this.initialized = true;

    this.stylesheetService.loadAndRegisterSheet(
      Services.io.newURI(this.stylesheet, null, null),
      Ci.nsIStyleSheetService.USER_SHEET
    );
  },

  shutdown: function()
  {
    if (!this.initialized)
      return;
    this.initialized = false;

    this.stylesheetService.unregisterSheet(
      Services.io.newURI(this.stylesheet, null, null),
      Ci.nsIStyleSheetService.USER_SHEET
    );
  }
};

var RemoveCheckboxLabel =
{
  __proto__: StylesheetFeature,
  stylesheet: "chrome://abpcustomization/content/noCheckboxLabel.css"
};

var RemoveActionsButton =
{
  __proto__: StylesheetFeature,
  stylesheet: "chrome://abpcustomization/content/noActionButton.css"
};

var features =
{
  "vertical-preferences-layout": VerticalPreferencesLayout,
  "preferences-one-line-subscriptions": OneLineSubscriptions,
  "preferences-remove-checkbox-label": RemoveCheckboxLabel,
  "preferences-remove-actions-button": RemoveActionsButton
};
