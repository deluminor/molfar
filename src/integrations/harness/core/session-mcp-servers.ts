import { invoke } from "@tauri-apps/api/core";

/** ACP v1 stdio MCP server — no `type` key (agents may silently drop unknown variants). */
export type AcpStdioMcpServer = {
  name: string;
  command: string;
  args: string[];
  env: Array<{ name: string; value: string }>;
};

export type AcpHttpMcpServer = {
  name: string;
  type: "http" | "sse";
  url: string;
  headers: Array<{ name: string; value: string }>;
};

export type AcpMcpServer = AcpStdioMcpServer | AcpHttpMcpServer;

export const MOLFAR_CONNECTORS_SERVER_NAME = "molfar-connectors";

export type SessionMcpServersPayload = {
  providerLocal: AcpMcpServer[];
  molfarConnectors: AcpStdioMcpServer | null;
};

/**
 * Merge provider-local MCP with the MOLFAR connectors server.
 * Never returns a wipe sentinel — empty only when both sides are empty.
 * Disk entries named `molfar-connectors` are replaced by ours when connected.
 */
export function buildSessionMcpServers(input: {
  providerLocal: readonly AcpMcpServer[];
  molfarConnectors: AcpStdioMcpServer | null;
}): AcpMcpServer[] {
  const locals = input.providerLocal.filter(
    (server) => server.name !== MOLFAR_CONNECTORS_SERVER_NAME,
  );

  if (!input.molfarConnectors) {
    return [...locals];
  }

  return [...locals, { ...input.molfarConnectors }];
}

/** Claude `--mcp-config` object map (not ACP array). */
export function toClaudeMcpConfig(
  servers: readonly AcpMcpServer[],
): { mcpServers: Record<string, Record<string, unknown>> } {
  const mcpServers: Record<string, Record<string, unknown>> = {};

  for (const server of servers) {
    if ("command" in server) {
      const env: Record<string, string> = {};
      for (const entry of server.env) {
        env[entry.name] = entry.value;
      }
      mcpServers[server.name] = {
        command: server.command,
        ...(server.args.length > 0 ? { args: [...server.args] } : {}),
        ...(Object.keys(env).length > 0 ? { env } : {}),
      };
      continue;
    }

    const headers: Record<string, string> = {};
    for (const entry of server.headers) {
      headers[entry.name] = entry.value;
    }
    mcpServers[server.name] = {
      type: server.type,
      url: server.url,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    };
  }

  return { mcpServers };
}

/** Load disk locals + optional molfar-connectors, then merge. */
export async function loadSessionMcpServers(
  provider: string,
  cwd: string,
): Promise<AcpMcpServer[]> {
  try {
    const payload = await invoke<SessionMcpServersPayload>("session_mcp_servers", {
      provider,
      cwd,
    });
    return buildSessionMcpServers(payload);
  } catch (error) {
    console.error("[molfar] session_mcp_servers failed", { provider, cwd, error });
    return [];
  }
}
