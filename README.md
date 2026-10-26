# Pulse Point

Pulse Point is served by a small Python standard-library server. It serves the website and emails each recorded customer interaction to `pulsepoint034@gmail.com`.

## Run locally

Python 3.10 or later is required. No packages need to be installed.

In PowerShell, set SMTP credentials for the email account that will send the notifications, then start the server:

```powershell
$env:SMTP_HOST = "smtp.gmail.com"
$env:SMTP_PORT = "587"
$env:SMTP_USERNAME = "your-sending-address@gmail.com"
$env:SMTP_PASSWORD = "your-gmail-app-password"
python server.py
```

Open `http://127.0.0.1:8000`. Gmail SMTP requires an app password for accounts with two-step verification. Keep the password in the environment and out of source control. If using another mail provider, set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, and `SMTP_PASSWORD` to that provider's SMTP settings. For implicit TLS on port 465, also set `$env:SMTP_USE_SSL = "true"`.

Check server and email configuration at `http://127.0.0.1:8000/api/health`. `email_configured` is `false` until both SMTP username and password are set. Events return an error instead of showing a success message when email delivery is unavailable.

## Customer activity sent by email

The site sends page views, section views, navigation and action clicks, quick-guide opens and closes, quiz answers and results, map marker clicks, and interest-form submissions. The form submission includes the customer's name, email address, and selected interest. The site does not send raw keystrokes, passwords, or payment details. Activity is sent as individual plain-text emails and grouped by a temporary browser-session ID.

The backend validates event names and fields, limits request size and event rate, rejects cross-origin JSON requests, and does not store the submitted activity. Set `HOST=0.0.0.0` and `PORT` to the platform-provided port when deploying behind an HTTPS reverse proxy.
