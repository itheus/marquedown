"use strict";

const { app, BrowserWindow, Menu, dialog, ipcMain, screen } = require("electron");
const http = require("http");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");

const ROOT = __dirname;
const SMOKE = !!process.env.MARQUEDOWN_SMOKE;

app.setName("Marquedown");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
};

const FILE_FILTERS = [
  { name: "Markdown", extensions: ["md", "markdown", "mdown", "txt"] },
  { name: "All Files", extensions: ["*"] },
];

let win = null;
let server = null;
let dirty = false;
let forceClose = false;
let pendingQuit = false;

const state = {
  initialized: false,
  lastFile: null,
  window: null,
};

let stateFile = null;
let queuedPath = null;
let rendererReady = false;
let revealCurrentWindow = () => {};

function loadState() {
  stateFile = path.join(app.getPath("userData"), "state.json");

  let parsed = null;

  try {
    parsed = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  } catch (e) {
    return;
  }

  if (!parsed || typeof parsed !== "object") return;

  state.initialized = !!parsed.initialized;

  if (typeof parsed.lastFile === "string" && parsed.lastFile && parsed.lastFile !== ROOT) {
    state.lastFile = parsed.lastFile;
  }

  if (parsed.window && typeof parsed.window === "object") state.window = parsed.window;
}

function saveState() {
  if (SMOKE || !stateFile) return;

  try {
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), "utf8");
  } catch (e) {

  }
}

function onScreen(x, y, width, height) {
  return screen.getAllDisplays().some((display) => {
    const a = display.workArea;

    return x < a.x + a.width && x + width > a.x && y < a.y + a.height && y + height > a.y;
  });
}

function savedWindowOptions() {
  const opts = {};
  const saved = state.window;

  if (!saved) return opts;

  if (typeof saved.width === "number" && typeof saved.height === "number") {
    opts.width = Math.max(Math.round(saved.width), 1340);
    opts.height = Math.max(Math.round(saved.height), 360);
  }

  if (
    typeof saved.x === "number" &&
    typeof saved.y === "number" &&
    onScreen(saved.x, saved.y, opts.width || 1440, opts.height || 900)
  ) {
    opts.x = Math.round(saved.x);
    opts.y = Math.round(saved.y);
  }

  return opts;
}

function persistWindowBounds() {
  if (!win || win.isDestroyed()) return;

  const maximized = win.isMaximized();
  const bounds = maximized ? win.getNormalBounds() : win.getBounds();

  if (!bounds || !bounds.width || !bounds.height) return;

  state.window = {
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    maximized: maximized,
  };

  saveState();
}

function fileFromArgv(argv) {
  if (!Array.isArray(argv)) return null;

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];

    if (!arg || arg.charAt(0) === "-") continue;

    let candidate = null;

    try {
      candidate = path.resolve(arg);
    } catch (e) {
      continue;
    }

    if (candidate === ROOT) continue;

    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch (e) {

    }
  }

  return null;
}

async function readDocument(filePath) {
  if (!filePath) return null;

  try {
    const content = await fsp.readFile(filePath, "utf8");

    return { source: "file", path: filePath, name: path.basename(filePath), content };
  } catch (e) {
    return null;
  }
}

async function deliverQueuedFile() {
  if (!queuedPath || !rendererReady) return;
  if (!win || win.isDestroyed() || win.webContents.isLoading()) return;

  const filePath = queuedPath;
  queuedPath = null;

  const doc = await readDocument(filePath);

  if (!doc) {
    dialog.showErrorBox("Marquedown", "Could not open " + filePath);
    return;
  }

  send("app:open-file", doc);
}

function openPath(filePath) {
  if (!filePath) return;

  queuedPath = filePath;

  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    deliverQueuedFile();
  }
}

function startServer() {
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      let urlPath = "/";
      try {
        urlPath = decodeURIComponent(req.url.split("?")[0]);
      } catch (e) {

      }

      const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
      const filePath = path.resolve(ROOT, rel);

      if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Not found");
          return;
        }

        res.writeHead(200, {
          "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
        });
        res.end(data);
      });
    });

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload);
    return true;
  }

  return false;
}

function buildMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        { label: "New", accelerator: "CmdOrCtrl+N", click: () => send("menu:new") },
        { label: "Open…", accelerator: "CmdOrCtrl+O", click: () => send("menu:open") },
        { label: "Save", accelerator: "CmdOrCtrl+S", click: () => send("menu:save") },
        { label: "Save As…", accelerator: "CmdOrCtrl+Shift+S", click: () => send("menu:saveAs") },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        {
          label: "Toggle Dark Theme",
          accelerator: "CmdOrCtrl+Shift+D",
          click: () => send("menu:toggle-theme"),
        },
        { type: "separator" },
        { label: "Toggle Developer Tools", click: () => win && win.webContents.toggleDevTools() },
      ],
    },
    { role: "windowMenu" },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createWindow() {
  const port = await startServer();
  const savedBounds = savedWindowOptions();

  rendererReady = false;

  let readyToShow = false;
  let rendererRendered = false;
  let showTimer = null;

  const tryReveal = () => {
    if (SMOKE || !readyToShow || !rendererRendered) return;

    if (showTimer) {
      clearTimeout(showTimer);
      showTimer = null;
    }

    if (win && !win.isDestroyed() && !win.isVisible()) win.show();
  };

  revealCurrentWindow = tryReveal;

  win = new BrowserWindow({
    width: 1440,
    height: 900,
    ...savedBounds,
    title: "Marquedown",
    icon: path.join(ROOT, "assets", "icon.png"),

    minWidth: 1340,
    minHeight: 360,
    backgroundColor: "#15181d",
    show: false,
    webPreferences: {
      preload: path.join(ROOT, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  let boundsTimer = null;

  const scheduleBounds = () => {
    if (boundsTimer) clearTimeout(boundsTimer);
    boundsTimer = setTimeout(persistWindowBounds, 400);
  };

  win.on("resize", scheduleBounds);
  win.on("move", scheduleBounds);
  win.on("maximize", scheduleBounds);
  win.on("unmaximize", scheduleBounds);

  win.once("ready-to-show", () => {
    if (state.window && state.window.maximized) win.maximize();

    readyToShow = true;
    tryReveal();

    showTimer = setTimeout(() => {
      rendererRendered = true;
      tryReveal();
    }, 1500);
  });

  win.on("closed", () => {
    revealCurrentWindow = () => {};
  });

  win.webContents.on("did-finish-load", () => {
    if (!SMOKE) return;

    win.webContents
      .executeJavaScript(
        "JSON.stringify({" +
          "electron: !!window.electronAPI," +
          "open: !!document.querySelector('i[name=\"open\"]')," +
          "save: !!document.querySelector('i[name=\"save\"]')," +
          "groups: document.querySelectorAll('.hui-tb-group-item').length," +
          "editor: !!document.querySelector('.CodeMirror')" +
          "})"
      )
      .then((state) => {
        console.log("SMOKE_STATE", state);
        console.log("SMOKE_OK");
      })
      .catch((err) => console.log("SMOKE_ERR", err.message))
      .then(() => setTimeout(() => app.quit(), 300));
  });

  win.on("close", (e) => {
    if (boundsTimer) clearTimeout(boundsTimer);
    persistWindowBounds();

    if (forceClose || !dirty) return;

    e.preventDefault();

    const choice = dialog.showMessageBoxSync(win, {
      type: "warning",
      buttons: ["Save", "Don't Save", "Cancel"],
      defaultId: 0,
      cancelId: 2,
      message: "Do you want to save the changes you made?",
      detail: "Your changes will be lost if you don't save them.",
    });

    if (choice === 0) {
      pendingQuit = true;
      send("menu:save");
    } else if (choice === 1) {
      forceClose = true;
      win.close();
    }
  });

  await win.loadURL(`http://127.0.0.1:${port}/index.html`);
}

ipcMain.handle("app:initial", async () => {
  rendererReady = true;

  if (queuedPath) {
    const filePath = queuedPath;
    queuedPath = null;

    const doc = await readDocument(filePath);

    if (doc) return doc;
  }

  if (state.lastFile) {
    const doc = await readDocument(state.lastFile);

    if (doc) return doc;

    state.lastFile = null;
    saveState();
  }

  if (!state.initialized) {
    state.initialized = true;
    saveState();
    return { source: "welcome" };
  }

  return { source: "empty" };
});

ipcMain.on("app:last-doc", (e, doc) => {
  const filePath = doc && typeof doc.path === "string" && doc.path ? doc.path : null;

  if (filePath !== state.lastFile) {
    state.lastFile = filePath;
    saveState();
  }
});

ipcMain.handle("dialog:open", async () => {
  const result = await dialog.showOpenDialog(win, {
    properties: ["openFile"],
    filters: FILE_FILTERS,
  });

  if (result.canceled || !result.filePaths.length) return null;

  const filePath = result.filePaths[0];
  const content = await fsp.readFile(filePath, "utf8");

  return { path: filePath, name: path.basename(filePath), content };
});

ipcMain.handle("dialog:save-as", async (e, payload) => {
  const result = await dialog.showSaveDialog(win, {
    defaultPath: (payload && payload.suggestedName) || "untitled.md",
    filters: FILE_FILTERS,
  });

  if (result.canceled || !result.filePath) return null;

  await fsp.writeFile(result.filePath, (payload && payload.content) || "", "utf8");

  return { path: result.filePath, name: path.basename(result.filePath) };
});

ipcMain.handle("file:write", async (e, payload) => {
  await fsp.writeFile(payload.path, payload.content, "utf8");
  return true;
});

ipcMain.handle("app:error", async (e, message) => {
  await dialog.showMessageBox(win, {
    type: "error",
    buttons: ["OK"],
    message: "Save failed",
    detail: String(message || "Unknown error"),
  });
});

ipcMain.on("app:dirty", (e, value) => {
  dirty = !!value;
});

ipcMain.on("app:rendered", () => {
  revealCurrentWindow();
});

ipcMain.on("app:save-done", () => {
  if (pendingQuit) {
    forceClose = true;
    win.close();
  }
});

ipcMain.on("app:save-canceled", () => {
  pendingQuit = false;
});

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (event, argv) => {
    const filePath = fileFromArgv(argv);

    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }

    if (filePath) openPath(filePath);
  });

  app.on("open-file", (event, filePath) => {
    event.preventDefault();
    openPath(filePath);
  });

  app.whenReady().then(() => {
    loadState();

    const startupFile = fileFromArgv(process.argv);
    if (startupFile && !queuedPath) queuedPath = startupFile;

    buildMenu();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (server) server.close();
    if (process.platform !== "darwin") app.quit();
  });
}
