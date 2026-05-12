import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const speakeasy = require("speakeasy");
import axios from "axios";
import * as dotenv from "dotenv";

dotenv.config();

// ─── Config helpers ────────────────────────────────────────────────────────────

interface TotpAccount {
  label: string;
  secret: string;
}

function getTotpAccounts(): TotpAccount[] {
  const accounts: TotpAccount[] = [];
  let i = 1;
  while (process.env[`TOTP_SECRET_${i}`]) {
    accounts.push({
      secret: process.env[`TOTP_SECRET_${i}`]!,
      label: process.env[`TOTP_LABEL_${i}`] ?? `Account ${i}`,
    });
    i++;
  }
  return accounts;
}

const TENANT_ID = process.env.MICROSOFT_TENANT_ID ?? "common";
const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET ?? "";
const REDIRECT_URI =
  process.env.MICROSOFT_REDIRECT_URI ?? "http://localhost:3000/auth/callback";
const SCOPES = (
  process.env.MICROSOFT_SCOPES ??
  "openid profile email offline_access User.Read"
).split(" ");

const DEFAULT_AUTHORITY = `https://login.microsoftonline.com/${TENANT_ID}`;

// ─── Tool definitions ──────────────────────────────────────────────────────────

const tools: Tool[] = [
  {
    name: "list_totp_accounts",
    description:
      "List all TOTP accounts configured in this MCP server (labels only, no secrets).",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_totp_code",
    description:
      "Generate the current 6-digit TOTP/OTP code for a configured account. " +
      "Use this to fill in 2FA fields during login automation. Codes refresh every 30 seconds.",
    inputSchema: {
      type: "object",
      properties: {
        account_label: {
          type: "string",
          description:
            "Label of the account to generate a code for. " +
            "Use list_totp_accounts to see available labels. Omit for the first account.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_totp_code_with_timing",
    description:
      "Generate the current TOTP code AND return how many seconds remain before it expires. " +
      "Useful to decide whether to wait for a fresh code before submitting a form.",
    inputSchema: {
      type: "object",
      properties: {
        account_label: {
          type: "string",
          description: "Label of the account. Omit for first account.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_microsoft_auth_url",
    description:
      "Generate a Microsoft OAuth authorization URL. " +
      "Open this URL in the browser to start the login flow. " +
      "After login, Microsoft redirects to redirect_uri with a 'code' query parameter.",
    inputSchema: {
      type: "object",
      properties: {
        state: {
          type: "string",
          description:
            "Optional random state string for CSRF protection. Auto-generated if omitted.",
        },
        extra_scopes: {
          type: "array",
          items: { type: "string" },
          description:
            "Extra scopes beyond the defaults (e.g. ['Mail.Read', 'Calendars.Read']).",
        },
        prompt: {
          type: "string",
          enum: ["login", "consent", "select_account", "none"],
          description:
            "Prompt behavior. Use 'select_account' to always show account picker.",
        },
        account_type: {
          type: "string",
          enum: ["personal", "work_school", "both"],
          description:
            "'personal' uses /consumers, 'work_school' uses /organizations, 'both' uses /common (default).",
        },
      },
      required: [],
    },
  },
  {
    name: "exchange_code_for_token",
    description:
      "Exchange the authorization code (from the redirect URL after login) for access and refresh tokens.",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description:
            "The 'code' query parameter from the Microsoft redirect URL after login.",
        },
        account_type: {
          type: "string",
          enum: ["personal", "work_school", "both"],
          description: "Must match the account_type used in get_microsoft_auth_url.",
        },
      },
      required: ["code"],
    },
  },
  {
    name: "refresh_access_token",
    description:
      "Use a refresh token to get a new access token without requiring the user to log in again.",
    inputSchema: {
      type: "object",
      properties: {
        refresh_token: {
          type: "string",
          description:
            "The refresh_token from a previous exchange_code_for_token or refresh call.",
        },
        account_type: {
          type: "string",
          enum: ["personal", "work_school", "both"],
          description: "Must match the original account type.",
        },
      },
      required: ["refresh_token"],
    },
  },
  {
    name: "get_microsoft_user_info",
    description:
      "Fetch the signed-in user's profile from Microsoft Graph API using an access token.",
    inputSchema: {
      type: "object",
      properties: {
        access_token: {
          type: "string",
          description:
            "A valid Microsoft access token with at least User.Read scope.",
        },
      },
      required: ["access_token"],
    },
  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getAuthority(accountType?: string): string {
  switch (accountType) {
    case "personal":
      return "https://login.microsoftonline.com/consumers";
    case "work_school":
      return "https://login.microsoftonline.com/organizations";
    default:
      return DEFAULT_AUTHORITY;
  }
}

function findAccount(label?: string): TotpAccount | null {
  const accounts = getTotpAccounts();
  if (!accounts.length) return null;
  if (!label) return accounts[0];
  return (
    accounts.find((a) => a.label.toLowerCase() === label.toLowerCase()) ??
    accounts[0]
  );
}

// ─── Tool handlers ─────────────────────────────────────────────────────────────

async function handleTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  if (name === "list_totp_accounts") {
    const accounts = getTotpAccounts();
    if (!accounts.length)
      return "No TOTP accounts configured. Add TOTP_SECRET_1 and TOTP_LABEL_1 to your .env file.";
    return `Configured TOTP accounts:\n${accounts
      .map((a, i) => `  ${i + 1}. ${a.label}`)
      .join("\n")}`;
  }

  if (name === "get_totp_code") {
    const accounts = getTotpAccounts();
    console.error(`[DEBUG] Accounts found: ${accounts.length}`);
    console.error(`[DEBUG] TOTP_SECRET_1 env: ${process.env.TOTP_SECRET_1?.substring(0, 20)}...`);
    const account = findAccount(args.account_label as string | undefined);
    if (!account) return "No TOTP accounts configured.";
    try {
      console.error(`[DEBUG] Using account: ${account.label}, secret: ${account.secret.substring(0, 20)}...`);
      const code = speakeasy.totp({ secret: account.secret, encoding: "base32" });
      console.error(`[DEBUG] Generated code: ${code}`);
      return `Code: ${code} | Account: ${account.label} | Secret: ${account.secret.substring(0, 20)}...`;
    } catch (err) {
      return `Failed to generate TOTP code: ${String(err)}. Ensure the secret is a valid Base32 string.`;
    }
  }

  if (name === "get_totp_code_with_timing") {
    const account = findAccount(args.account_label as string | undefined);
    if (!account) return "No TOTP accounts configured.";
    try {
      const code = speakeasy.totp({ secret: account.secret, encoding: "base32" });
      const secondsRemaining = 30 - (Math.floor(Date.now() / 1000) % 30);
      return JSON.stringify(
        {
          account: account.label,
          code,
          seconds_remaining: secondsRemaining,
          recommendation:
            secondsRemaining < 5
              ? "Wait — code expires in under 5 seconds. A fresh code will be safer."
              : "Safe to use now.",
        },
        null,
        2
      );
    } catch (err) {
      return `Failed to generate TOTP code: ${String(err)}`;
    }
  }

  if (name === "get_microsoft_auth_url") {
    if (!CLIENT_ID) return "MICROSOFT_CLIENT_ID is not set in .env";
    const authority = getAuthority(args.account_type as string | undefined);
    const state =
      (args.state as string) ?? Math.random().toString(36).substring(2);
    const allScopes = [...SCOPES, ...((args.extra_scopes as string[]) ?? [])];
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: "code",
      redirect_uri: REDIRECT_URI,
      scope: allScopes.join(" "),
      state,
      ...(args.prompt ? { prompt: args.prompt as string } : {}),
    });
    const url = `${authority}/oauth2/v2.0/authorize?${params.toString()}`;
    return JSON.stringify({ auth_url: url, state, scopes: allScopes }, null, 2);
  }

  if (name === "exchange_code_for_token") {
    if (!CLIENT_ID || !CLIENT_SECRET)
      return "MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET must be set in .env";
    const authority = getAuthority(args.account_type as string | undefined);
    try {
      const response = await axios.post(
        `${authority}/oauth2/v2.0/token`,
        new URLSearchParams({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          code: args.code as string,
          redirect_uri: REDIRECT_URI,
          grant_type: "authorization_code",
          scope: SCOPES.join(" "),
        }),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );
      const { access_token, refresh_token, expires_in, token_type, scope } =
        response.data;
      return JSON.stringify(
        {
          access_token,
          refresh_token,
          expires_in,
          token_type,
          scope,
          note: "Store refresh_token securely. Use refresh_access_token to renew when access_token expires.",
        },
        null,
        2
      );
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? JSON.stringify(err.response?.data)
        : String(err);
      return `Token exchange failed: ${msg}`;
    }
  }

  if (name === "refresh_access_token") {
    if (!CLIENT_ID || !CLIENT_SECRET)
      return "MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET must be set in .env";
    const authority = getAuthority(args.account_type as string | undefined);
    try {
      const response = await axios.post(
        `${authority}/oauth2/v2.0/token`,
        new URLSearchParams({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          refresh_token: args.refresh_token as string,
          grant_type: "refresh_token",
          scope: SCOPES.join(" "),
        }),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );
      const { access_token, refresh_token, expires_in } = response.data;
      return JSON.stringify(
        { access_token, refresh_token, expires_in },
        null,
        2
      );
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? JSON.stringify(err.response?.data)
        : String(err);
      return `Token refresh failed: ${msg}`;
    }
  }

  if (name === "get_microsoft_user_info") {
    try {
      const response = await axios.get(
        "https://graph.microsoft.com/v1.0/me",
        { headers: { Authorization: `Bearer ${args.access_token}` } }
      );
      return JSON.stringify(response.data, null, 2);
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? JSON.stringify(err.response?.data)
        : String(err);
      return `Graph API call failed: ${msg}`;
    }
  }

  return `Unknown tool: ${name}`;
}

// ─── Server setup ──────────────────────────────────────────────────────────────

const server = new Server(
  { name: "mcp-microsoft-auth", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const result = await handleTool(
    name,
    (args ?? {}) as Record<string, unknown>
  );
  return { content: [{ type: "text", text: result }] };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("✅ MCP Microsoft Auth server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
