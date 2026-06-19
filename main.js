const { app, BrowserWindow, screen, ipcMain, Tray, Menu, shell, nativeImage } = require('electron');
const path = require('path');

const SUPABASE_URL = 'https://ttcprqkoibiztibhpsrp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_iQhPAY-M-OUbFVbLQyCp5g_540rSkd1';
const TICKER_HEIGHT = 44;
const FINNHUB_KEY   = 'd8fhh6hr01qn443a0bngd8fhh6hr01qn443a0bo0';

// ── electron-store ────────────────────────────────────────────────────────────
let Store, store;
try {
  Store = require('electron-store');
  store = new Store({
    defaults: {
      tickers: ['AAPL','NVDA','MSFT','TSLA','META','AMZN','JPM','GOOGL','BRK-B','XOM'],
      adEnabled: true,
      theme: 'dark',
      // Auth persistence
      rememberedEmail:   null,
      accessToken:       null,
      refreshToken:      null,
      userId:            null,
      username:          null,
    }
  });
} catch(e) {
  console.warn('electron-store not available:', e.message);
  store = null;
}

function getSettings()         { return store ? store.store : { tickers: ['AAPL','NVDA','MSFT','TSLA','META','AMZN','JPM','GOOGL','BRK-B','XOM'] }; }
function saveSettings(s)       { if (store) Object.assign(store.store, s); return getSettings(); }
function getStored(key)        { return store ? store.get(key) : null; }
function setStored(key, val)   { if (store) store.set(key, val); }
function clearAuth()           {
  if (store) {
    store.set('accessToken',  null);
    store.set('refreshToken', null);
    store.set('userId',       null);
    store.set('username',     null);
    store.set('rememberedEmail', null);
  }
}

let tickerWindow = null;
let loginWindow  = null;
let tray         = null;
let isHidden     = false;

// ── Programmatic tray icon ────────────────────────────────────────────────────
function createTrayIcon() {
  const size = process.platform === 'darwin' ? 16 : 32;
  return nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(`
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${size}" height="${size}" rx="3" fill="#1A6BF5"/>
        <text x="50%" y="73%" font-family="Arial" font-weight="bold"
              font-size="${size * 0.65}px" fill="white" text-anchor="middle">P</text>
      </svg>
    `).toString('base64')}`
  );
}

// ── Login window ──────────────────────────────────────────────────────────────
function createLoginWindow() {
  loginWindow = new BrowserWindow({
    width: 340,
    height: 460,
    resizable: false,
    titleBarStyle: 'hiddenInset',
    title: 'PulseStock — Sign In',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload-login.js'),
    },
  });
  loginWindow.loadFile('login.html');
  loginWindow.on('closed', () => { loginWindow = null; });
}

// ── Ticker window ─────────────────────────────────────────────────────────────
function createTickerWindow() {
  const fullWidth = screen.getPrimaryDisplay().bounds.width;
  tickerWindow = new BrowserWindow({
    width: fullWidth,
    height: TICKER_HEIGHT,
    x: 0, y: 0,
    frame: false, transparent: false,
    alwaysOnTop: true, resizable: false,
    movable: false, minimizable: false,
    maximizable: false, closable: false,
    skipTaskbar: true, hasShadow: false,
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
  tickerWindow.on('close', e => e.preventDefault());
  return tickerWindow;
}

function createTray() {
  let icon;
  try {
    icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray-icon.png'));
    if (icon.isEmpty()) throw new Error('empty');
  } catch(e) {
    icon = createTrayIcon();
  }

  tray = new Tray(icon);
  const contextMenu = Menu.buildFromTemplate([
    { label: 'PulseStock Ticker', enabled: false },
    { type: 'separator' },
    { label: isHidden ? 'Show Ticker' : 'Hide Ticker', click: () => toggleVisibility() },
    { label: 'Open PulseStock', click: () => shell.openExternal('https://pulsestock-nu.vercel.app') },
    { label: 'Edit Tickers…', click: () => tickerWindow?.webContents.send('open-settings') },
    { type: 'separator' },
    { label: getStored('username') ? `Signed in as ${getStored('username')}` : 'Not signed in', enabled: false },
    { label: getStored('accessToken') ? 'Sign Out' : 'Sign In…', click: () => {
        if (getStored('accessToken')) {
          clearAuth();
          if (store) store.set('tickers', ['AAPL','NVDA','MSFT','TSLA','META','AMZN','JPM','GOOGL','BRK-B','XOM']);
          tickerWindow?.webContents.send('update-tickers', getSettings().tickers);
        } else {
          createLoginWindow();
        }
      }
    },
    { type: 'separator' },
    { label: 'Quit', click: () => { tickerWindow?.destroy(); app.quit(); } },
  ]);
  tray.setToolTip('PulseStock Ticker');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => shell.openExternal('https://pulsestock-nu.vercel.app'));
}

function toggleVisibility() {
  isHidden = !isHidden;
  if (isHidden) { tickerWindow?.hide(); }
  else { tickerWindow?.show(); tickerWindow?.setPosition(0, 0); }
}

// ── Restore session on launch ─────────────────────────────────────────────────
async function tryRestoreSession() {
  const token   = getStored('accessToken');
  const refresh = getStored('refreshToken');
  if (!token || !refresh) return false;

  try {
    // Use Supabase REST to refresh the session
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    const data = await res.json();
    if (!data.access_token) return false;

    // Fetch latest tickers from profile
    const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=tickers,username&id=eq.${getStored('userId')}`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${data.access_token}` }
    });
    const profiles = await profileRes.json();
    const profile  = profiles?.[0];

    if (profile?.tickers) {
      const tickers = profile.tickers.split(',').map(s => s.trim()).filter(Boolean);
      if (store) store.set('tickers', tickers);
    }
    if (profile?.username && store) store.set('username', profile.username);
    if (store) {
      store.set('accessToken',  data.access_token);
      store.set('refreshToken', data.refresh_token || refresh);
    }
    return true;
  } catch(e) {
    console.warn('Session restore failed:', e.message);
    return false;
  }
}

// ── IPC: login window ─────────────────────────────────────────────────────────
ipcMain.handle('login-success', (event, payload) => {
  const { userId, email, username, tickers, remember, token, refresh } = payload;
  if (remember) {
    setStored('accessToken',    token);
    setStored('refreshToken',   refresh);
    setStored('userId',         userId);
    setStored('username',       username);
    setStored('rememberedEmail', email);
  }
  if (tickers?.length) {
    if (store) store.set('tickers', tickers);
    tickerWindow?.webContents.send('update-tickers', tickers);
  }
  loginWindow?.close();
});

ipcMain.handle('login-skip', () => {
  loginWindow?.close();
});

// ── IPC: ticker window ────────────────────────────────────────────────────────
ipcMain.handle('get-settings',    ()           => getSettings());
ipcMain.handle('save-settings',   (e, s)       => saveSettings(s));
ipcMain.handle('open-stock',      (e, ticker)  => shell.openExternal(`https://pulsestock-nu.vercel.app/?ticker=${ticker}`));
ipcMain.handle('open-external',   (e, url)     => shell.openExternal(url));
ipcMain.handle('quit-app',        ()           => { tickerWindow?.destroy(); app.quit(); });
ipcMain.handle('set-ignore-mouse',(e, ignore)  => tickerWindow?.setIgnoreMouseEvents(ignore, { forward: true }));

ipcMain.handle('get-quotes', async (event, tickers) => {
  const results = {};
  await Promise.all(tickers.map(async ticker => {
    try {
      const res  = await fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_KEY}`);
      const data = await res.json();
      if (data?.c) results[ticker] = { price: data.c, change: data.d, changePct: data.dp, open: data.o, high: data.h, low: data.l, prevClose: data.pc };
    } catch(e) { console.error(`Quote error for ${ticker}:`, e.message); }
  }));
  return results;
});

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  createTickerWindow();
  createTray();

  // Try to restore saved session silently
  const restored = await tryRestoreSession();

  // If not restored and not "remember me" token exists, show login
  if (!restored && !getStored('accessToken')) {
    // Small delay so ticker bar renders first
    setTimeout(() => createLoginWindow(), 800);
  } else if (restored) {
    // Push restored tickers to ticker window
    const tickers = getSettings().tickers;
    setTimeout(() => tickerWindow?.webContents.send('update-tickers', tickers), 1000);
  }

  app.on('activate', () => { if (!tickerWindow) createTickerWindow(); });
});

app.on('window-all-closed', e => e.preventDefault());
app.on('before-quit', () => tickerWindow?.destroy());
