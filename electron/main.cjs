/**
 * 밤샘 문제공장 — Electron 메인 프로세스.
 * - 내장 서버(dist/app.cjs)를 같은 프로세스에서 띄우고 자체 창으로 UI를 연다.
 * - 시작 시 GitHub Releases에서 새 버전을 확인해 자동 다운로드 후 알림을 띄운다.
 * - 모든 시작 단계를 로그 파일에 남긴다 (문제 진단용).
 */
const { app, BrowserWindow, shell, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const net = require("net");

// 구형 노트북의 GPU 드라이버 크래시(창이 떴다가 바로 사라지는 대표 원인) 방지
app.disableHardwareAcceleration();
app.setAppUserModelId("kr.bamsam.factory");

// ---------- 진단 로그 ----------
let logPath;
try {
  logPath = path.join(app.getPath("userData"), "bamsam.log");
} catch {
  logPath = path.join(os.tmpdir(), "bamsam.log");
}
function log(msg) {
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}
process.on("uncaughtException", (e) => {
  log(`FATAL: ${e.stack || e.message}`);
  try {
    dialog.showErrorBox("밤샘 문제공장 오류", `${e.message}\n\n로그: ${logPath}`);
  } catch {}
});
log(`--- 시작 v${app.getVersion()} (${process.platform} ${os.release()}) ---`);

let PORT = 8977;
process.env.BAMSAM_NO_OPEN = "1"; // 서버가 외부 브라우저를 열지 않도록

// 단일 인스턴스 (앱을 두 번 실행하면 기존 창을 앞으로, 창이 없으면 새로 만듦)
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  log("이미 실행 중인 인스턴스가 있어 종료");
  app.quit();
} else {
  let mainWin = null;

  const windowOpts = () => ({
    width: 560,
    height: 860,
    title: "밤샘 문제공장",
    icon: path.join(__dirname, "icon.png"),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true },
  });

  function createWindow() {
    log("창 생성");
    mainWin = new BrowserWindow(windowOpts());
    mainWin.loadURL(`http://127.0.0.1:${PORT}/`);
    // 문제지 새 탭 → 새 앱 창 (외부 링크는 기본 브라우저로)
    mainWin.webContents.setWindowOpenHandler(({ url }) => {
      if (url.includes(`127.0.0.1:${PORT}`) || url.includes(`localhost:${PORT}`)) {
        return {
          action: "allow",
          overrideBrowserWindowOptions: { ...windowOpts(), width: 920, height: 1000 },
        };
      }
      shell.openExternal(url);
      return { action: "deny" };
    });
    // 순간적인 연결 실패 시 자동 재시도
    mainWin.webContents.on("did-fail-load", (_e, code, desc) => {
      log(`페이지 로딩 실패(${code} ${desc}) → 재시도`);
      setTimeout(() => mainWin && mainWin.loadURL(`http://127.0.0.1:${PORT}/`), 600);
    });
    mainWin.on("closed", () => (mainWin = null));
  }

  app.on("second-instance", () => {
    if (mainWin) {
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.focus();
    } else {
      createWindow();
    }
  });

  /** 사용 가능한 포트를 OS에서 할당받음 (다른 프로그램과의 포트 충돌 원천 차단) */
  function getFreePort() {
    return new Promise((resolve) => {
      const srv = net.createServer();
      srv.once("error", () => resolve(8977));
      srv.listen(0, "127.0.0.1", () => {
        const p = srv.address().port;
        srv.close(() => resolve(p));
      });
    });
  }

  /** 서버가 응답할 때까지 대기 후 창 생성 (느린 디스크/백신 검사 대비) */
  function waitForServer(tries = 60) {
    const http = require("http");
    const req = http.get(`http://127.0.0.1:${PORT}/`, (res) => {
      res.resume();
      log("서버 응답 확인");
      createWindow();
    });
    req.on("error", () => {
      if (tries > 0) setTimeout(() => waitForServer(tries - 1), 250);
      else {
        log("서버 응답 없음 — 포기");
        dialog.showErrorBox("밤샘 문제공장", `내부 서버를 시작하지 못했습니다.\n로그: ${logPath}`);
        app.quit();
      }
    });
    req.setTimeout(1000, () => req.destroy());
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
      autoUpdater.on("error", (e) => log(`업데이트 확인 실패(무시): ${e.message}`));
      autoUpdater.checkForUpdates().catch(() => {});
      // 실행 중에도 4시간마다 확인
      setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 3600 * 1000);
    } catch (e) {
      log(`업데이트 모듈 없음(개발 모드?): ${e.message}`);
    }
  }

  app.whenReady().then(async () => {
    log("app ready");
    PORT = await getFreePort();
    process.env.PORT = String(PORT);
    log(`포트 할당: ${PORT}`);
    // 내장 서버 시작 (같은 프로세스)
    try {
      require(path.join(__dirname, "..", "dist", "app.cjs"));
      log("서버 모듈 로딩 완료");
    } catch (e) {
      log(`서버 모듈 로딩 실패: ${e.stack || e.message}`);
      dialog.showErrorBox("밤샘 문제공장", `서버 모듈 로딩 실패: ${e.message}\n로그: ${logPath}`);
      app.quit();
      return;
    }
    waitForServer();
    setupAutoUpdate();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    log("모든 창 닫힘 — 종료");
    app.quit();
  });
}
