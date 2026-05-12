# MCP TOTP Auth - Project Guide

## Overview
This is an MCP (Model Context Protocol) server that generates TOTP/OTP codes for 2FA automation. It works with authenticator apps that support Base32 secret export (Google Authenticator, Raivo, Authy, etc.).

## Architecture

### Core Files
- **`src/index.ts`** — Main MCP server implementation
  - `getTotpAccounts()` — Loads TOTP accounts from env vars
  - `findAccount()` — Helper to find account by label
  - `handleTool()` — Processes tool requests
  - Tools: `list_totp_accounts`, `get_totp_code`, `get_totp_code_with_timing`

- **`package.json`** — Project metadata and dependencies
  - Core: `speakeasy` (TOTP generation), `dotenv` (env vars)
  - SDK: `@modelcontextprotocol/sdk` (MCP framework)

### Configuration
- **`.env`** — Runtime secrets (TOTP_SECRET_*, TOTP_LABEL_*)
- **`.mcp.json`** — Claude Code registration
- **`claude_desktop_config.json`** — Claude Desktop registration (user's own file)

## Development

### Build and Test
```bash
npm install        # Install dependencies
npm run build      # Compile TypeScript → dist/index.js
npm run dev        # Run dev server with ts-node
```

### Testing
1. Set TOTP_SECRET_1 in `.env` with your Base32 secret
2. Run `npm run dev`
3. Compare output of `get_totp_code` with your authenticator app (should match)

### Adding new TOTP accounts
1. Add to `.env`:
   ```
   TOTP_SECRET_2=YOUR_BASE32_SECRET
   TOTP_LABEL_2=account-label
   ```
2. Rebuild: `npm run build`
3. Restart server

## Branches

- **`main`** — Production-ready code
- **`feature/testing`** — Feature development branch

Always commit to feature branch first, then merge to main after testing.

## Common Tasks

### Update dependencies
```bash
npm install  # Updates package-lock.json
npm run build
```

### Add new tool
1. Add tool definition to `tools` array in `src/index.ts`
2. Add handler in `handleTool()` function
3. Test with `npm run dev`
4. Build and commit

### Change TOTP algorithm
Currently using `speakeasy.totp()` with:
- Encoding: Base32
- Algorithm: SHA1 (default, standard for TOTP)
- Digits: 6
- Window: 30 seconds

To customize, pass options to `speakeasy.totp()`:
```typescript
speakeasy.totp({ 
  secret: account.secret, 
  encoding: "base32",
  algorithm: "sha256",  // change algorithm
  digits: 8            // change digit count
})
```

## Known Limitations

- **Microsoft Authenticator** doesn't export TOTP secrets (use push notifications instead)
- Base32 secrets must be 16-32+ characters
- TOTP codes refresh every 30 seconds

## Security

- Never commit `.env` (in `.gitignore`)
- TOTP secrets are as sensitive as passwords
- Store in `.env` locally, or use secrets manager for production
- Don't share `TOTP_SECRET_*` values
