import type { AppConfig } from "./types.js";

const config: AppConfig = {
  appName: "AFTMS Server",
  version: "0.0.1",
  shortDescription: "Air force Flight Training Management System server",
  publisher: "Pegasus Techonologies",
  AppPublisherURL: "https://www.pegasustech.net",
  appId: "{{A6074E46-8A8D-4A69-B843-21454B59DC24}",
  sourceFilesDir: "./bin/publish",
  mainExecutableInSourceDir: "./server.exe",
  serverPort: "7001",

  // This Decides where the application will be installed.
  installation: {
    directory: "{autopf}\\AFTMS-Server",
    requireAdmin: true,
    architecture: "x64",
  },

  outputBaseFilename: "AFTMS-{version}-Setup",

  service: {
    id: "AFTMSServerService",
    displayName: "AFTMS Server Service",
    description:
      "Pegasus Technologies Air Force Flight Training Management System server",
    maxLogFile: 8,
    logFileSizeThresholdKB: 1024 * 10, // 10MB
  },
};

export default config;
