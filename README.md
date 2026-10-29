# Pulse Point

Pulse Point is served by a small Python standard-library server. It serves the website and emails each recorded customer interaction to `pulsepoint034@gmail.com`.

## Run locally

Python 3.10 or later is required. No packages need to be installed.

Set SMTP credentials in `.env` for the email account that will send the notifications:

```text
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=pulsepoint034@gmail.com
SMTP_PASSWORD=your-gmail-app-password
SMTP_FROM=pulsepoint034@gmail.com
```

Keep `.env` private and do not share its password in chat. It is excluded from Git. Start or restart the server with `python server.py`, then open `http://127.0.0.1:8000`. For another mail provider, use its SMTP host, port, username, and password. For implicit TLS on port 465, set `SMTP_USE_SSL=true` in `.env`.

Check server and email configuration at `http://127.0.0.1:8000/api/health`. `email_configured` is `false` until both SMTP username and password are set. Events return an error instead of showing a success message when email delivery is unavailable.

## Customer activity sent by email

The site sends page views, section views, navigation and action clicks, quick-guide opens and closes, quiz answers and results, map marker clicks, interest-form submissions, and feedback-form submissions. Feedback includes the customer's name, email address, feedback type, and message. Activity is sent as individual plain-text emails to `pulsepoint034@gmail.com` and grouped by a temporary browser-session ID. The site does not send raw keystrokes, passwords, or payment details.

The backend validates event names and fields, limits request size and event rate, rejects cross-origin JSON requests, and does not store the submitted activity. Set `HOST=0.0.0.0` and `PORT` to the platform-provided port when deploying behind an HTTPS reverse proxy.
