import { mock } from "bun:test";

mock.module("vscode", () => ({
  workspace: {
    getConfiguration: () => ({
      get: (_key: string, defaultValue?: unknown) => defaultValue,
      update: async () => {},
    }),
  },
  window: {
    showWarningMessage: async () => undefined,
    showInformationMessage: async () => undefined,
    showErrorMessage: async () => undefined,
    withProgress: async (_opts: unknown, task: () => unknown) => task(),
    createOutputChannel: () => ({ appendLine: () => {}, show: () => {} }),
    createStatusBarItem: () => ({ text: "", show: () => {}, hide: () => {}, dispose: () => {} }),
    onDidChangeWindowState: () => ({ dispose: () => {} }),
    onDidChangeActiveColorTheme: () => ({ dispose: () => {} }),
  },
  commands: {
    executeCommand: async () => undefined,
    registerCommand: () => ({ dispose: () => {} }),
  },
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
  StatusBarAlignment: { Left: 1, Right: 2 },
  ProgressLocation: { Notification: 15 },
  env: { language: "en" },
}));
