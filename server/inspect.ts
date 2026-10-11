import type { AgentPermissionRequest, AgentTimelineItem } from "@getpaseo/protocol/agent-types";

export function latestOutputText(timeline: readonly AgentTimelineItem[]): string {
  let output = "";
  for (const item of timeline) {
    if (item.type === "user_message") {
      output = "";
    } else if ("text" in item && typeof item.text === "string") {
      output += item.text;
    } else {
      output += JSON.stringify(item) + "\n";
    }
  }
  return output;
}

export function shellCommand(request: AgentPermissionRequest): string | null {
  if (!request.input) {
    return null;
  }
  if (typeof request.input.command === "string") {
    return request.input.command;
  }
  if (typeof request.input.cmd === "string") {
    return request.input.cmd;
  }
  return null;
}

export interface ToolCallOzeti {
  name: string;
  hash: string;
  detailType: string;
  filePath?: string;
  exitCode?: number | null;
  command?: string;
  status: string;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([k, v]): [string, unknown] => (typeof v === "string" && v.length > 200 ? [k, v.slice(0, 200) + "~len=" + v.length] : [k, v]))
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => JSON.stringify(k) + ":" + stableStringify(v));
  return "{" + entries.join(",") + "}";
}

export function toolCallOzetleri(timeline: readonly AgentTimelineItem[]): ToolCallOzeti[] {
  const out: ToolCallOzeti[] = [];
  for (const item of timeline) {
    if (item.type !== "tool_call") {
      continue;
    }
    const detail = (item.detail ?? {}) as Record<string, unknown>;
    const detailType = typeof detail.type === "string" ? detail.type : "unknown";
    let anahtar: unknown = null;
    let exitCode: number | null | undefined;
    let command: string | undefined;
    let filePath: string | undefined;
    if (detailType === "shell") {
      anahtar = { command: detail.command };
      exitCode = typeof detail.exitCode === "number" ? detail.exitCode : null;
      command = typeof detail.command === "string" ? detail.command : undefined;
    } else if (detailType === "read" || detailType === "edit" || detailType === "write") {
      anahtar = { filePath: detail.filePath, offset: detail.offset };
      filePath = typeof detail.filePath === "string" ? detail.filePath : undefined;
    } else if (detailType === "search") {
      anahtar = { query: detail.query, mode: detail.mode };
    } else if (detailType === "fetch") {
      anahtar = { url: detail.url };
    } else {
      anahtar = stableStringify(detail);
    }
    out.push({
      name: item.name,
      hash: item.name + "|" + detailType + "|" + stableStringify(anahtar),
      detailType,
      filePath,
      exitCode,
      command,
      status: item.status,
    });
  }
  return out;
}

export function sonKullaniciMesajiIndex(timeline: readonly AgentTimelineItem[]): number {
  for (let i = timeline.length - 1; i >= 0; i--) {
    if (timeline[i].type === "user_message") {
      return i;
    }
  }
  return -1;
}