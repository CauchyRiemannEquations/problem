/**
 * 밤샘 문제공장 — Electron 메인 프로세스.
 * - 내장 서버(dist/app.cjs)를 같은 프로세스에서 띄우고 자체 창으로 UI를 연다.
 * - 문제지(target=_blank)는 새 앱 창으로 열린다.
 * - 시작 시 GitHub Releases에서 새 버전을 확인해 자동 다운로드 후 알림을 띄운다.
 */
const { app, BrowserWindow, shell, dialog } = require("electron");
const path = require("path");

const PORT = 8977;
process.env.PORT = String(PORT);
process.env.BAMSAM_NO_OPEN = "1"; // 서버가 외부 브라우저를 열지 않도록

// 단일 인스턴스 (앱을 두 번 실행하면 기존 창을 앞으로)
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  let mainWin = null;

  app.on("second-instance", () => {
    if (mainWin) {
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.focus();
    }
  });

  const windowOpts = {
    width: 560,
    height: 860,
    title: "밤샘 문제공장",
    icon: path.join(__dirname, "icon.png"),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true },
  };

  function createWindow() {
    mainWin = new BrowserWindow(windowOpts);
    mainWin.loadURL(`http://localhost:${PORT}/`);
    // 문제지 새 탭 → 새 앱 창 (외부 링크는 기본 브라우저로)
    mainWin.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith(`http://localhost:${PORT}`)) {
        return {
          action: "allow",
          overrideBrowserWindowOptions: { ...windowOpts, width: 920, height: 1000 },
        };
      }
      shell.openExternal(url);
      return { action: "deny" };
    });
    // 순간적인 연결 실패 시 자동 재시도
    mainWin.webContents.on("did-fail-load", () => {
      setTimeout(() => mainWin && mainWin.loadURL(`http://localhost:${PORT}/`), 600);
    });
    mainWin.on("closed", () => (mainWin = null));
  }

  function setupAutoUpdate() {
    try {
      const { autoUpdater } = require("electron-updater");
      autoUpdater.autoDownload = true;
      autoUpdater.on("update-downloaded", (info) => {
        dialog
          .showMessageBox({
            type: "info",
            title: "업데이트",
            message: `새 버전(${info.version})이 준비되었습니다.`,
            detail: "지금 다시 시작하면 업데이트가 적용됩니다.",
            buttons: ["지금 다시 시작", "나중에"],
            defaultId: 0,
          })
          .then(({ response }) => {
            if (response === 0) autoUpdater.quitAndInstall();
          });
      });
      autoUpdater.checkForUpdates().catch(() => {});
      // 실행 중에도 4시간마다 확인
      setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 3600 * 1000);
    } catch {
      /* 개발 모드 등 업데이트 불가 환경은 조용히 무시 */
    }
  }

  /** 서버가 응답할 때까지 대기 후 창 생성 (느린 디스크/백신 검사 대비) */
  function waitForServer(tries = 40) {
    const http = require("http");
    const req = http.get(`http://localhost:${PORT}/`, (res) => {
      res.resume();
      createWindow();
    });
    req.on("error", () => {
      if (tries > 0) setTimeout(() => waitForServer(tries - 1), 250);
      else {
        dialog.showErrorBox("밤샘 문제공장", "내부 서버를 시작하지 못했습니다. 다른 프로그램이 8977 포트를 사용 중인지 확인해 주세요.");
        app.quit();
      }
    });
    req.setTimeout(1000, () => req.destroy());
  }

  app.whenReady().then(() => {
    // 내장 서버 시작 (같은 프로세스)
    try {
      require(path.join(__dirname, "..", "dist", "app.cjs"));
    } catch (e) {
      dialog.showErrorBox("밤샘 문제공장", `서버 모듈 로딩 실패: ${e.message}`);
      app.quit();
      return;
    }
    waitForServer();
    setupAutoUpdate();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => app.quit());
}
