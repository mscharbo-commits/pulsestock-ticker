const { app, BrowserWindow, screen, ipcMain, Tray, Menu, shell, nativeImage } = require('electron');
const path = require('path');

// ── electron-store for persistent settings ───────────────────────────────────
let Store;
let store;
try {
  Store = require('electron-store');
  store = new Store({
    defaults: {
      tickers: ['AAPL', 'NVDA', 'MSFT', 'TSLA', 'META', 'AMZN', 'JPM', 'GOOGL', 'BRK-B', 'XOM'],
      adEnabled: true,
      theme: 'dark',
    }
  });
} catch(e) {
  // electron-store not installed yet — use in-memory fallback
  console.warn('electron-store not available, settings will not persist:', e.message);
  store = null;
}

const TICKER_HEIGHT = 44;
const FINNHUB_KEY = 'd8fhh6hr01qn443a0bngd8fhh6hr01qn443a0bo0';

let tickerWindow = null;
let tray = null;
let isHidden = false;

// ── Settings helpers ─────────────────────────────────────────────────────────
function getSettings() {
  if (store) return store.store;
  return {
    tickers: ['AAPL', 'NVDA', 'MSFT', 'TSLA', 'META', 'AMZN', 'JPM', 'GOOGL', 'BRK-B', 'XOM'],
    adEnabled: true,
    theme: 'dark',
  };
}

function saveSettings(settings) {
  if (store) {
    Object.assign(store.store, settings);
    return store.store;
  }
  return settings;
}

// ── Programmatic tray icon (no asset file needed) ────────────────────────────
function createTrayIcon() {
  // Draw a 16x16 "P" icon in memory using canvas-like nativeImage
  const size = process.platform === 'darwin' ? 16 : 32;
  const icon = nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(`
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${size}" height="${size}" rx="3" fill="#1A6BF5"/>
        <text x="50%" y="73%" font-family="Arial" font-weight="bold"
              font-size="${size * 0.65}px" fill="white"
              text-anchor="middle">P</text>
      </svg>
    `).toString('base64')}`
  );
  return icon;
}

function createTickerWindow() {
  const { width } = screen.getPrimaryDisplay().workAreaSize;
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

  if (process.platform === 'darwin') {
    tickerWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
    tickerWindow.setAlwaysOnTop(true, 'status', 1);
    tickerWindow.setIgnoreMouseEvents(false);
  } else if (process.platform === 'win32') {
    tickerWindow.setAlwaysOnTop(true, 'pop-up-menu');
  }

  tickerWindow.loadFile('ticker.html');
  tickerWindow.setPosition(0, 0);

  tickerWindow.on('close', (e) => {
    e.preventDefault();
  });

  return tickerWindow;
}

function createTray() {
  let icon;
  try {
    // Try loading the asset file first
    icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray-icon.png'));
    if (icon.isEmpty()) throw new Error('empty');
  } catch(e) {
    // Fall back to programmatic icon
    icon = createTrayIcon();
  }

  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    { label: 'PulseStock Ticker', enabled: false },
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
ipcMain.handle('get-settings', () => getSettings());

ipcMain.handle('save-settings', (event, settings) => saveSettings(settings));

ipcMain.handle('open-stock', (event, ticker) => {
  shell.openExternal(`https://pulsestock-nu.vercel.app/?ticker=${ticker}`);
});

ipcMain.handle('open-external', (event, url) => {
  shell.openExternal(url);
});

ipcMain.handle('quit-app', () => {
  tickerWindow?.destroy();
  app.quit();
});

ipcMain.handle('set-ignore-mouse', (event, ignore) => {
  if (tickerWindow) {
    tickerWindow.setIgnoreMouseEvents(ignore, { forward: true });
  }
});

ipcMain.handle('get-quotes', async (event, tickers) => {
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
  e.preventDefault();
});

app.on('before-quit', () => {
  tickerWindow?.destroy();
});
