# MCP TOTP Auth Server

An MCP (Model Context Protocol) server that generates **TOTP/OTP codes** for 2FA automation. Works with any authenticator app that supports Base32 secret export: Google Authenticator, Raivo, Authy, Microsoft Authenticator, etc.

---

## Tools provided

| Tool | Description |
|------|-------------|
| `list_totp_accounts` | List configured TOTP account labels |
| `get_totp_code` | Get current 6-digit OTP for an account |
| `get_totp_code_with_timing` | Get OTP + seconds remaining before expiry |

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Get your TOTP secret

#### While scanning a QR code during 2FA setup:
1. When you see the QR code on the login page
2. Look for **"Can't scan the QR code?"** or **"Enter a setup key instead"** link below it
3. Tap it → you'll see the Base32 secret displayed
4. Copy the secret and add it to `.env`

#### From Google Authenticator:
1. Open Google Authenticator
2. Tap the account you want to export
3. Tap the three dots → "Show details" / "Export account"
4. Scan with **Raivo** (or take a screenshot and extract Base32)
5. In Raivo, tap Edit on the account → see the Base32 secret

#### From Raivo:
1. Open Raivo
2. Tap the account
3. Tap "Edit"
4. Copy the Base32 seed/secret

#### From other authenticators:
- Look for "Export", "Show secret", or "Can't scan QR code?" options
- The secret should be a 16-32 character Base32 string (A-Z, 2-7 only)

### 3. Configure environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Add your TOTP secrets:

```env
TOTP_SECRET_1=YOUR_BASE32_SECRET_HERE
TOTP_LABEL_1=your-email@example.com

TOTP_SECRET_2=ANOTHER_SECRET_HERE
TOTP_LABEL_2=work@company.com
```

### 4. Build

```bash
npm run build
```

---

## Register with Claude

### Claude Code

Add to your MCP config at `~/claude/.mcp.json`:

```json
{
  "mcpServers": {
    "totp-auth": {
      "command": "node",
      "args": ["/absolute/path/to/dist/index.js"],
      "env": {
        "TOTP_SECRET_1": "YOUR_BASE32_SECRET",
        "TOTP_LABEL_1": "email@example.com"
      }
    }
  }
}
```

### Claude Desktop

Add to your config at `%APPDATA%\Claude\claude_desktop_config.json` (Windows) or `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "totp-auth": {
      "command": "node",
      "args": ["C:\\absolute\\path\\to\\dist\\index.js"],
      "env": {
        "TOTP_SECRET_1": "YOUR_BASE32_SECRET",
        "TOTP_LABEL_1": "email@example.com"
      }
    }
  }
}
```

**Steps:**
1. Locate the config file path above for your OS
2. Open `claude_desktop_config.json` in a text editor
3. Add the `totp-auth` server block under `mcpServers`
4. Replace `/absolute/path/to/` with the actual path to this repo's `dist/` folder
5. Replace `YOUR_BASE32_SECRET` with your actual TOTP secret
6. Save the file
7. Restart Claude Desktop
8. The `get_totp_code` tool will now be available

> **Tip:** You can put secrets in `.env` instead and only set the command/args in the config — `dotenv` loads it automatically.

---

## Usage example

With Claude automating login:

```
1. "Get the TOTP code for my AWS account"
   → Claude calls get_totp_code → returns 6-digit code

2. "Fill in the 2FA code"
   → Claude enters code in the login form

3. Code matches authenticator app and login succeeds ✓
```

---

## Security notes

- **Never commit `.env`** — it's in `.gitignore`
- TOTP secrets are equivalent to your 2FA device — treat them like passwords
- For production use, consider a secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.)
