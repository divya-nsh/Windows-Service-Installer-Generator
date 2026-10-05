export type AppConfig = {
  appName: string;
  shortDescription?: string;

  version: string;
  publisher: string;
  AppPublisherURL?: string;
  appId: string;
  /** Directory from where files will be copied to the installation directory. */
  sourceFilesDir: string;
  /** Path to the main executable in the source directory. */
  mainExecutableInSourceDir: string;
  /** Configuration for the installation directory. */
  installation: {
    /** Directory where the application will be installed. */
    directory: string;
    requireAdmin: boolean;
    architecture: string;
  };

  serverPort?: string;

  /** Base filename of the output file. Example: "AFTMSServer-1.0.0-Setup" */
  outputBaseFilename: string;
  service: {
    id: string;
    displayName: string;
    description: string;
    maxLogFile: number;
    logFileSizeThresholdKB: number;
  };
};
