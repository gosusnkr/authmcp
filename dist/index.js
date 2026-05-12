"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const speakeasy = require("speakeasy");
const dotenv = __importStar(require("dotenv"));
dotenv.config();
function getTotpAccounts() {
    const accounts = [];
    let i = 1;
    while (process.env[`TOTP_SECRET_${i}`]) {
        accounts.push({
            secret: process.env[`TOTP_SECRET_${i}`],
            label: process.env[`TOTP_LABEL_${i}`] ?? `Account ${i}`,
        });
        i++;
    }
    return accounts;
}
// ─── Tool definitions ──────────────────────────────────────────────────────────
const tools = [
    {
        name: "list_totp_accounts",
        description: "List all TOTP accounts configured in this MCP server (labels only, no secrets).",
        inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
        name: "get_totp_code",
        description: "Generate the current 6-digit TOTP/OTP code for a configured account. " +
            "Use this to fill in 2FA fields during login automation. Codes refresh every 30 seconds.",
        inputSchema: {
            type: "object",
            properties: {
                account_label: {
                    type: "string",
                    description: "Label of the account to generate a code for. " +
                        "Use list_totp_accounts to see available labels. Omit for the first account.",
                },
            },
            required: [],
        },
    },
    {
        name: "get_totp_code_with_timing",
        description: "Generate the current TOTP code AND return how many seconds remain before it expires. " +
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
];
// ─── Helpers ───────────────────────────────────────────────────────────────────
function findAccount(label) {
    const accounts = getTotpAccounts();
    if (!accounts.length)
        return null;
    if (!label)
        return accounts[0];
    return (accounts.find((a) => a.label.toLowerCase() === label.toLowerCase()) ??
        accounts[0]);
}
// ─── Tool handlers ─────────────────────────────────────────────────────────────
async function handleTool(name, args) {
    if (name === "list_totp_accounts") {
        const accounts = getTotpAccounts();
        if (!accounts.length)
            return "No TOTP accounts configured. Add TOTP_SECRET_1 and TOTP_LABEL_1 to your .env file.";
        return `Configured TOTP accounts:\n${accounts
            .map((a, i) => `  ${i + 1}. ${a.label}`)
            .join("\n")}`;
    }
    if (name === "get_totp_code") {
        const account = findAccount(args.account_label);
        if (!account)
            return "No TOTP accounts configured.";
        try {
            const code = speakeasy.totp({ secret: account.secret, encoding: "base32" });
            return code;
        }
        catch (err) {
            return `Failed to generate TOTP code: ${String(err)}. Ensure the secret is a valid Base32 string.`;
        }
    }
    if (name === "get_totp_code_with_timing") {
        const account = findAccount(args.account_label);
        if (!account)
            return "No TOTP accounts configured.";
        try {
            const code = speakeasy.totp({ secret: account.secret, encoding: "base32" });
            const secondsRemaining = 30 - (Math.floor(Date.now() / 1000) % 30);
            return JSON.stringify({
                account: account.label,
                code,
                seconds_remaining: secondsRemaining,
                recommendation: secondsRemaining < 5
                    ? "Wait — code expires in under 5 seconds. A fresh code will be safer."
                    : "Safe to use now.",
            }, null, 2);
        }
        catch (err) {
            return `Failed to generate TOTP code: ${String(err)}`;
        }
    }
    return `Unknown tool: ${name}`;
}
// ─── Server setup ──────────────────────────────────────────────────────────────
const server = new index_js_1.Server({ name: "mcp-totp-auth", version: "1.0.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => ({ tools }));
server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const result = await handleTool(name, (args ?? {}));
    return { content: [{ type: "text", text: result }] };
});
async function main() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    console.error("✅ MCP TOTP Auth server running on stdio");
}
main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
