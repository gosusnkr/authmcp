# MCP Microsoft Auth Server

An MCP (Model Context Protocol) server that gives Claude the ability to:
- Generate **TOTP/OTP codes** (like Microsoft Authenticator) for 2FA automation
- Drive the full **Microsoft OAuth flow** for both personal and work/school (Azure AD / Entra ID) accounts

---

## Tools provided

| Tool | Description |
|------|-------------|
| `list_totp_accounts` | List configured TOTP account labels |
| `get_totp_code` | Get current 6-digit OTP for an account |
| `get_totp_code_with_timing` | Get OTP + seconds remaining before expiry |
| `get_microsoft_auth_url` | Generate OAuth login URL |
| `exchange_code_for_token` | Exchange auth code → access + refresh tokens |
| `refresh_access_token` | Refresh an expired access token |
| `get_microsoft_user_info` | Fetch user profile from Microsoft Graph |

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

#### TOTP secrets

Your TOTP secret is the **Base32 seed** behind the QR code when you set up Microsoft Authenticator.
To get it:
- When adding a new account in any app, look for **"Can't scan QR code?"** → it shows the Base32 key
- For existing accounts: use an app like **Raivo OTP** (iOS) or **Aegis** (Android) which support secret export

Add one or more accounts:
```env
TOTP_SECRET_1=JBSWY3DPEHPK3PXP...   # your Base32 secret
TOTP_LABEL_1=me@outlook.com

TOTP_SECRET_2=ANOTHER_SECRET...
TOTP_LABEL_2=work@company.com
```

#### Microsoft OAuth app

1. Go to [Azure Portal → App registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps)
2. Click **New registration**
   - Name: anything (e.g. "My MCP Auth")
   - Supported account types: **"Accounts in any organizational directory and personal Microsoft accounts"** (for `both`)
   - Redirect URI: `http://localhost:3000/auth/callback` (Web)
3. Copy the **Application (client) ID** → `MICROSOFT_CLIENT_ID`
4. Go to **Certificates & secrets** → New client secret → copy value → `MICROSOFT_CLIENT_SECRET`
5. Set `MICROSOFT_TENANT_ID=common` for both personal + work accounts

```env
MICROSOFT_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
MICROSOFT_CLIENT_SECRET=your-secret-value
MICROSOFT_TENANT_ID=common
MICROSOFT_REDIRECT_URI=http://localhost:3000/auth/callback
MICROSOFT_SCOPES=openid profile email offline_access User.Read
```

### 3. Build

```bash
npm run build
```

---

## Register with Claude

Add this to your Claude MCP config (e.g. `~/.claude/mcp_servers.json` or Claude Desktop settings):

```json
{
  "mcpServers": {
    "microsoft-auth": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-microsoft-auth/dist/index.js"],
      "env": {
        "TOTP_SECRET_1": "YOUR_SECRET",
        "TOTP_LABEL_1": "me@example.com",
        "MICROSOFT_CLIENT_ID": "your-client-id",
        "MICROSOFT_CLIENT_SECRET": "your-client-secret",
        "MICROSOFT_TENANT_ID": "common",
        "MICROSOFT_REDIRECT_URI": "http://localhost:3000/auth/callback",
        "MICROSOFT_SCOPES": "openid profile email offline_access User.Read"
      }
    }
  }
}
```

> **Tip:** You can put secrets in `.env` and omit the `env` block above if you prefer — `dotenv` loads it automatically.

---

## Usage example (browser automation)

With Claude in Chrome or any browser automation:

```
1. "Get me a Microsoft auth URL"
   → Claude calls get_microsoft_auth_url → returns a URL

2. "Navigate to that URL"
   → Claude opens the login page

3. User enters email/password, then Claude sees the 2FA prompt

4. "Fill in the 2FA code for me@outlook.com"
   → Claude calls get_totp_code_with_timing to check timing
   → Calls get_totp_code → fills the field automatically

5. After redirect: "Exchange the code in the URL for a token"
   → Claude calls exchange_code_for_token → returns access + refresh tokens
```

---

## Security notes

- **Never commit `.env`** — it's in `.gitignore`
- TOTP secrets are equivalent to your 2FA device — treat them like passwords
- Store refresh tokens securely (encrypted at rest if possible)
- For production use, consider Azure Key Vault or a secrets manager instead of `.env`
