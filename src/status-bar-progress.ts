import * as vscode from "vscode";

export function isLightTheme(): boolean {
  const kind = vscode.window.activeColorTheme.kind;
  return kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight;
}

export function progressBarDataUri(ratio: number, barWidth = 220): string {
  const clamped = Math.min(Math.max(ratio, 0), 1);
  const width = barWidth;
  const height = 10;
  const r = height / 2;
  const fillWidth = Math.round(clamped * width);

  const light = isLightTheme();
  const trackColor = light ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.18)";
  const fillColor = light ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.82)";

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`;
  svg += `<rect width="${width}" height="${height}" rx="${r}" ry="${r}" fill="${trackColor}"/>`;
  if (fillWidth > 0) {
    svg += `<rect width="${fillWidth}" height="${height}" rx="${r}" ry="${r}" fill="${fillColor}"/>`;
  }
  svg += `</svg>`;

  const encoded = Buffer.from(svg).toString("base64");
  return `data:image/svg+xml;base64,${encoded}`;
}

export function progressBarMarkdown(ratio: number, barWidth = 220): string {
  return `![](${progressBarDataUri(ratio, barWidth)})`;
}

export function progressBarHtml(ratio: number, barWidth = 220): string {
  return `<img src="${progressBarDataUri(ratio, barWidth)}" width="${barWidth}" height="10" />`;
}

export function segmentedProgressBarDataUri(
  segments: Array<{ ratio: number; opacity: number }>,
  barWidth = 220,
): string {
  const width = barWidth;
  const height = 10;
  const r = height / 2;
  const light = isLightTheme();
  const trackColor = light ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.18)";
  const fillColor = light ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.82)";

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`;
  svg += `<rect width="${width}" height="${height}" rx="${r}" ry="${r}" fill="${trackColor}"/>`;

  let offset = 0;
  for (const segment of segments) {
    const segmentWidth = Math.round(Math.min(Math.max(segment.ratio, 0), 1) * width);
    if (segmentWidth <= 0) continue;
    const opacity = Math.min(Math.max(segment.opacity, 0), 1);
    svg += `<rect x="${offset}" width="${segmentWidth}" height="${height}" fill="${fillColor}" opacity="${opacity}"/>`;
    offset += segmentWidth;
  }
  svg += `</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export function segmentedProgressBarHtml(
  segments: Array<{ ratio: number; opacity: number }>,
  barWidth = 220,
): string {
  return `<img src="${segmentedProgressBarDataUri(segments, barWidth)}" width="${barWidth}" height="10" />`;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    };
    return entities[char] ?? char;
  });
}

export function summaryDividerHtml(height = 52): string {
  const light = isLightTheme();
  const strokeColor = light ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.14)";
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="2" height="${height}" viewBox="0 0 2 ${height}">`,
    `<rect x="0.5" y="0" width="1" height="${height}" fill="${strokeColor}"/>`,
    `</svg>`,
  ].join("");
  const encoded = Buffer.from(svg).toString("base64");
  return `<img src="data:image/svg+xml;base64,${encoded}" width="2" height="${height}" />`;
}
