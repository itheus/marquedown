"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,

  openFile: () => ipcRenderer.invoke("dialog:open"),

  getInitialDocument: () => ipcRenderer.invoke("app:initial"),

  setLastDocument: (doc) => ipcRenderer.send("app:last-doc", doc ? { path: doc.path } : null),

  onOpenFile: (handler) => ipcRenderer.on("app:open-file", (event, doc) => handler(doc)),

  saveFileAs: (suggestedName, content) =>
    ipcRenderer.invoke("dialog:save-as", { suggestedName, content }),

  writeFile: (filePath, content) => ipcRenderer.invoke("file:write", { path: filePath, content }),

  setDirty: (value) => ipcRenderer.send("app:dirty", value),

  saveDone: () => ipcRenderer.send("app:save-done"),
  saveCanceled: () => ipcRenderer.send("app:save-canceled"),

  rendered: () => ipcRenderer.send("app:rendered"),

  showError: (message) => ipcRenderer.invoke("app:error", message),

  onMenu: (handler) => {
    ipcRenderer.on("menu:new", () => handler("new"));
    ipcRenderer.on("menu:open", () => handler("open"));
    ipcRenderer.on("menu:save", () => handler("save"));
    ipcRenderer.on("menu:saveAs", () => handler("saveAs"));
    ipcRenderer.on("menu:toggle-theme", () => handler("toggleTheme"));
  },
});
