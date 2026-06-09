const { app, BrowserWindow, screen, ipcMain, Tray, Menu, shell, nativeImage } = require('electron');
const path = require('path');

const TICKER_HEIGHT = 44;
const FINNHUB_KEY = 'd8fhh6hr01qn443a0bngd8fhh6hr01qn443a0bo0';

let tickerWindow = null;
let tray = null;
let isHidden = false;

// ── Store user settings ──────────────────────────────────────────────────────
let userSettings = {
  tickers: ['AAPL', 'NVDA', 'MSFT', 'TSLA', 'META', 'AMZN', 'JPM', 'GOOGL', 'BRK-B', 'XOM'],
  adEnabled: true,
  theme: 'dark',
};

function createTickerWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const fullWidth = screen.getPrimaryDisplay().bounds.width;

  tickerWindow = new BrowserWindow({
    width: fullWidth,
    height: TICKER_HEIGHT,
    x: 0,
    y: 0,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // ── Reserve screen space (push windows down) ─────────────────────────────
  if (process.platform === 'darwin') {
    tickerWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
    // Use 'status' level - sits above normal windows but below system UI
    tickerWindow.setAlwaysOnTop(true, 'status', 1);
    // Allow mouse events to pass through to apps below when not over our content
    // The renderer will call setIgnoreMouseEvents(false) when mouse enters content
    tickerWindow.setIgnoreMouseEvents(false);
  } else if (process.platform === 'win32') {
    tickerWindow.setAlwaysOnTop(true, 'pop-up-menu');
  }

  tickerWindow.loadFile('ticker.html');
  tickerWindow.setPosition(0, 0);

  // Prevent closing
  tickerWindow.on('close', (e) => {
    e.preventDefault();
  });

  return tickerWindow;
}

function reserveMacScreenSpace() {
  // On Mac, we use the accessibility API to inform the system
  // that we've taken the top 44px. This pushes all app windows down.
  if (process.platform === 'darwin') {
    const { systemPreferences } = require('electron');
    // Set the window level to status bar so it sits above everything
    tickerWindow.setAlwaysOnTop(true, 'status', 1);
    // Force recalculate work area
    tickerWindow.setPosition(0, 0, false);
  }
}

function createTray() {
  // Create a simple tray icon
  const iconSize = process.platform === 'darwin' ? 16 : 32;
  const icon = nativeImage.createEmpty();
  
  try {
    tray = new Tray(path.join(__dirname, 'assets', 'tray-icon.png'));
  } catch(e) {
    // Fallback if icon missing
    const { nativeImage } = require('electron');
    tray = new Tray(nativeImage.createEmpty());
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'PulseStock Ticker',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: isHidden ? 'Show Ticker' : 'Hide Ticker',
      click: () => toggleVisibility(),
    },
    {
      label: 'Open PulseStock',
      click: () => shell.openExternal('https://pulsestock-nu.vercel.app'),
    },
    {
      label: 'Edit Tickers...',
      click: () => tickerWindow?.webContents.send('open-settings'),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        tickerWindow?.destroy();
        app.quit();
      },
    },
  ]);

  tray.setToolTip('PulseStock Ticker');
  tray.setContextMenu(contextMenu);
  
  tray.on('double-click', () => {
    shell.openExternal('https://pulsestock-nu.vercel.app');
  });
}

function toggleVisibility() {
  isHidden = !isHidden;
  if (isHidden) {
    tickerWindow?.hide();
  } else {
    tickerWindow?.show();
    tickerWindow?.setPosition(0, 0);
  }
}

// ── IPC handlers ─────────────────────────────────────────────────────────────
ipcMain.handle('get-settings', () => userSettings);

ipcMain.handle('save-settings', (event, settings) => {
  userSettings = { ...userSettings, ...settings };
  return userSettings;
});

ipcMain.handle('open-stock', (event, ticker) => {
  shell.openExternal(`https://pulsestock-nu.vercel.app/?ticker=${ticker}`);
});

ipcMain.handle('open-external', (event, url) => {
  shell.openExternal(url);
});

ipcMain.handle('set-ignore-mouse', (event, ignore) => {
  if (tickerWindow) {
    tickerWindow.setIgnoreMouseEvents(ignore, { forward: true });
  }
});

ipcMain.handle('get-quotes', async (event, tickers) => {
  // Fetch quotes for all tickers in parallel
  const results = {};
  await Promise.all(tickers.map(async (ticker) => {
    try {
      const url = `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_KEY}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data && data.c) {
        results[ticker] = {
          price: data.c,
          change: data.d,
          changePct: data.dp,
          open: data.o,
          high: data.h,
          low: data.l,
          prevClose: data.pc,
        };
      }
    } catch(e) {
      console.error(`Quote error for ${ticker}:`, e.message);
    }
  }));
  return results;
});

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createTickerWindow();
  createTray();

  app.on('activate', () => {
    if (!tickerWindow) createTickerWindow();
  });
});

app.on('window-all-closed', (e) => {
  e.preventDefault(); // Don't quit when window closes
});

app.on('before-quit', () => {
  tickerWindow?.destroy();
});
