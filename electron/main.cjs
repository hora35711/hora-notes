// Electron 主进程：启动窗口、注册 IPC，并桥接笔记变更事件。
const path = require("node:path")
const fs = require("node:fs")
const { app, BrowserWindow, ipcMain, shell } = require("electron")
const db = require("./db.cjs")

let mainWindow = null

// 广播笔记变更：通知所有渲染进程刷新侧边栏目录。
function notifyNotesChanged() {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("notes-changed")
  }
}

// 注册 IPC：渲染层通过 preload 调用本地数据库方法。
function registerDbIpc() {
  ipcMain.handle("shell:notes:showInFinder", (_event, noteId) => {
    const note = db.getNoteById(noteId)
    if (!note || !note.filePath) {
      throw new Error("目标节点不存在")
    }

    const targetPath = path.join(db.getVaultPath(), note.filePath)
    if (!fs.existsSync(targetPath)) {
      throw new Error("目标路径不存在")
    }

    // 只让系统 Finder 定位当前文件或文件夹，不触发目录刷新或路由变化。
    shell.showItemInFolder(targetPath)
    return true
  })

  ipcMain.handle("db:projects:list", () => db.listProjects())
  ipcMain.handle("db:projects:create", (_event, input) => db.createProject(input))
  ipcMain.handle("db:projects:get", (_event, projectId) => db.getProjectById(projectId))

  ipcMain.handle("db:requirements:listByProject", (_event, projectId) =>
    db.listRequirementsByProject(projectId),
  )
  ipcMain.handle("db:requirements:create", (_event, input) =>
    db.createRequirement(input),
  )
  ipcMain.handle("db:requirements:updateStatus", (_event, input) =>
    db.updateRequirementStatus(input),
  )

  ipcMain.handle("db:notes:list", () => db.listNoteNodes())
  ipcMain.handle("db:notes:get", (_event, noteId) => db.getNoteById(noteId))
  ipcMain.handle("db:notes:read", (_event, noteId) => db.readNoteContent(noteId))
  ipcMain.handle("db:notes:save", (_event, input) => db.saveNoteContent(input))
  ipcMain.handle("db:notes:create", (_event, input) => {
    const result = db.createNoteNode(input)
    notifyNotesChanged()
    return result
  })
  ipcMain.handle("db:notes:rename", (_event, input) => {
    const result = db.renameNoteNode(input)
    notifyNotesChanged()
    return result
  })
  ipcMain.handle("db:notes:delete", (_event, input) => {
    const result = db.deleteNoteNode(input)
    notifyNotesChanged()
    return result
  })
  ipcMain.handle("db:notes:move", (_event, input) => {
    const result = db.moveNoteNode(input)
    notifyNotesChanged()
    return result
  })
}

// 创建窗口：开发态加载 Next dev server，打包态加载本地占位页面。
function createMainWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1080,
    minHeight: 720,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow = win

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    win.loadURL(devUrl)
    return
  }

  win.loadFile(path.join(__dirname, "renderer", "index.html"))
}

app.whenReady().then(() => {
  // 启动后先做一次同步，保证 UI 初次读取就是最新目录。
  db.syncVaultToDatabase()

  // 启动文件监听：任何 notes 目录变化都推送前端刷新。
  db.startNotesWatcher(() => {
    notifyNotesChanged()
  })

  registerDbIpc()
  createMainWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})
