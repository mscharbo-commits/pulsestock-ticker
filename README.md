# PulseStock Ticker — Desktop App

A persistent 44px ticker bar that docks to the top of your screen and pushes all windows down.

## Features
- Live stock quotes (15s refresh via Finnhub)
- Scrolling ticker tape — customizable tickers
- Search any ticker → opens PulseStock analysis in browser
- Rotating broker affiliate ads (Webull, IBKR, Tastytrade)
- Market status indicator (Open/Pre/After/Closed with ET time)
- PulseStock branding badge
- Right-click anywhere to edit ticker list

## Setup

```bash
npm install
npm start          # Run in development
npm run build-mac  # Build .dmg for Mac
npm run build-win  # Build .exe for Windows
```

## Icons needed (add to assets/)
- icon.icns (Mac, 512x512)
- icon.ico (Windows, 256x256)
- tray-icon.png (16x16 for Mac menu bar, 32x32 for Windows)

## Screen Reservation
- Mac: Uses NSWindow level "status" — sits above all app windows
- Windows: Uses always-on-top at "pop-up-menu" level

## Customization
Edit ads[] in ticker.html to add/change affiliate partners.
Each ad has: logo, logoColor, headline, sub, cta, ctaColor, url.

## Revenue Model
- Free: shows broker affiliate ads
- Paid subscribers: can hide ads (future feature)
- Affiliate commissions: $50-200 per funded brokerage account

## Ticker Settings
Right-click the bar → Settings
Enter tickers one per line or comma-separated.
Settings persist across restarts.
