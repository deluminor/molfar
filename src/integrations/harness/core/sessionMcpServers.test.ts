import { describe, expect, it } from "vitest";
import {
  buildSessionMcpServers,
  MOLFAR_CONNECTORS_SERVER_NAME,
  toClaudeMcpConfig,
  type AcpMcpServer,
  type AcpStdioMcpServer,
} from "./sessionMcpServers";

const localDocs: AcpStdioMcpServer = {
  name: "docs",
  command: "npx",
  args: ["-y", "example-mcp"],
  env: [],
};

const localHttp: AcpMcpServer = {
  name: "remote",
  type: "http",
  url: "https://example.com/mcp",
  headers: [{ name: "Authorization", value: "Bearer user-token" }],
};

const connectors: AcpStdioMcpServer = {
  name: MOLFAR_CONNECTORS_SERVER_NAME,
  command: "/Applications/MOLFAR.app/Contents/MacOS/molfar",
  args: ["connectors-mcp"],
  env: [],
};

describe("buildSessionMcpServers", () => {
  it("returns empty only when nothing configured", () => {
    expect(
      buildSessionMcpServers({ providerLocal: [], molfarConnectors: null }),
    ).toEqual([]);
  });

  it("keeps provider-local servers when connectors offline", () => {
    expect(
      buildSessionMcpServers({
        providerLocal: [localDocs, localHttp],
        molfarConnectors: null,
      }),
    ).toEqual([localDocs, localHttp]);
  });

  it("injects molfar-connectors when connected and locals empty", () => {
    expect(
      buildSessionMcpServers({
        providerLocal: [],
        molfarConnectors: connectors,
      }),
    ).toEqual([connectors]);
  });

  it("merges locals then molfar-connectors", () => {
    expect(
      buildSessionMcpServers({
        providerLocal: [localDocs],
        molfarConnectors: connectors,
      }),
    ).toEqual([localDocs, connectors]);
  });

  it("replaces a disk molfar-connectors entry with ours", () => {
    const diskConnectors: AcpStdioMcpServer = {
      name: MOLFAR_CONNECTORS_SERVER_NAME,
      command: "echo",
      args: ["nope"],
      env: [{ name: "TOKEN", value: "secret" }],
    };

    const merged = buildSessionMcpServers({
      providerLocal: [localDocs, diskConnectors],
      molfarConnectors: connectors,
    });

    expect(merged).toEqual([localDocs, connectors]);
    expect(JSON.stringify(merged)).not.toContain("secret");
    expect(JSON.stringify(merged)).not.toContain("TOKEN");
  });

  it("connectors entry carries no Atlassian secret fields", () => {
    const merged = buildSessionMcpServers({
      providerLocal: [],
      molfarConnectors: connectors,
    });
    const serialized = JSON.stringify(merged);
    expect(serialized).not.toMatch(/token|apiKey|password|Authorization/i);
    expect(merged[0]).toMatchObject({
      name: MOLFAR_CONNECTORS_SERVER_NAME,
      args: ["connectors-mcp"],
      env: [],
    });
  });
});

describe("toClaudeMcpConfig", () => {
  it("maps ACP stdio servers to Claude mcpServers object", () => {
    expect(toClaudeMcpConfig([connectors, localDocs])).toEqual({
      mcpServers: {
        [MOLFAR_CONNECTORS_SERVER_NAME]: {
          command: connectors.command,
          args: ["connectors-mcp"],
        },
        docs: {
          command: "npx",
          args: ["-y", "example-mcp"],
        },
      },
    });
  });

  it("returns empty mcpServers object for empty list", () => {
    expect(toClaudeMcpConfig([])).toEqual({ mcpServers: {} });
  });
});
