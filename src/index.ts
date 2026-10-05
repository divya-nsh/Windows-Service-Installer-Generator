import path from "path";
import { cp, copyFile, mkdir, rm, writeFile } from "fs/promises";
import { existsSync, fstat } from "fs";
import config from "./config.js";
import { spawn } from "node:child_process";
import { styleText } from "util";

/**
 * Out Structure:
 *  - out/
 *    - publish/            <- everything that gets installed
 *      - main.exe          (your pkg-compiled server + other build files)
 *      - <serviceId>.exe   (WinSW)
 *      - <serviceId>.xml   (WinSW config)
 *    - inno-conf.iss       <- Inno Setup script (paths inside are relative to this file)
 *    - Output/             <- final Setup.exe
 */

const WIN_SW_BINARY_PATH = "./bin/WinSW-x64.exe";
const INNO_ISCC_BINARY_PATH =
  process.env.ISCC_PATH ?? "C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe";
const OUT_DESTINATION = "./out";
const PUBLISH_DIR = path.join(OUT_DESTINATION, "publish");
const INNO_CONFIG_FILE_PATH = path.join(OUT_DESTINATION, "inno-conf.iss");

if (!existsSync(WIN_SW_BINARY_PATH)) {
  throw new Error("WinSW executable not found");
}
if (!existsSync(INNO_ISCC_BINARY_PATH)) {
  throw new Error("Inno Setup ISCC executable not found");
}

// "./main.exe" -> "main.exe"
const mainExecutableFilename = path.basename(config.mainExecutableInSourceDir);
const serviceExecutableFilename = `${config.service.id}.exe`;
const serviceXMLFileName = `${config.service.id}.xml`;

if (!existsSync(path.join(config.sourceFilesDir, mainExecutableFilename))) {
  throw new Error(
    `Main executable not found in ${config.sourceFilesDir}: ${mainExecutableFilename}`,
  );
}

if (
  serviceExecutableFilename.toLowerCase() ===
  mainExecutableFilename.toLowerCase()
) {
  throw new Error(
    "Service executable filename cannot be the same as the main executable filename",
  );
}

console.log(styleText("blue", "Cleaning & Creating output directory..."));
// Start from a clean output so stale files never end up in the installer.
await rm(OUT_DESTINATION, { recursive: true, force: true });
await mkdir(PUBLISH_DIR, { recursive: true });

console.log(styleText("blue", "Copying source files to output directory..."));
// Copy the whole build folder (copyFile only works for single files).
await cp(config.sourceFilesDir, PUBLISH_DIR, { recursive: true });

// ---------------------------------------------------------------------------------//
// Building Service Files
// ---------------------------------------------------------------------------------//

console.log(styleText("blue", "Copying WinSW binary to output directory..."));
await copyFile(
  WIN_SW_BINARY_PATH,
  path.join(PUBLISH_DIR, serviceExecutableFilename),
);

console.log(styleText("blue", "Generating service XML file..."));
const xmlEscape = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const serviceXmlContent = `<service>
  <!-- Service identity -->
  <id>${xmlEscape(config.service.id)}</id>
  <name>${xmlEscape(config.service.displayName)}</name>
  <description>${xmlEscape(config.service.description)}</description>

  <!-- The program WinSW wraps: YOUR server, not WinSW itself -->
  <executable>%BASE%\\${mainExecutableFilename}</executable>
  <workingdirectory>%BASE%</workingdirectory>

  <!-- Start automatically with Windows -->
  <startmode>Automatic</startmode>

  <!-- Restart if the server crashes -->
  <onfailure action="restart" delay="10 sec" />
  <onfailure action="restart" delay="30 sec" />
  <onfailure action="restart" delay="2 min" />
  <resetfailure>1 hour</resetfailure>

  <stoptimeout>30 sec</stoptimeout>

  <!-- WinSW logs (sizeThreshold is in KB) -->
  <logpath>%BASE%\\ServiceLogs</logpath>
  <log mode="roll-by-size">
    <sizeThreshold>${config.service.logFileSizeThresholdKB ?? 10240}</sizeThreshold>
    <keepFiles>${config.service.maxLogFile ?? 8}</keepFiles>
  </log>
</service>
`;

console.log(
  styleText("blue", "Writing service XML file to output directory..."),
);
await writeFile(path.join(PUBLISH_DIR, serviceXMLFileName), serviceXmlContent);

// Create Utility Scripts for Service Management

for (const command of ["start", "stop", "restart", "uninstall", "status"]) {
  await writeFile(
    path.join(PUBLISH_DIR, `${command}-service.cmd`),
    `${serviceExecutableFilename} ${command}\npause\n`,
  );
}

// ---------------------------------------------------------------------------------//
// Building Inno Setup Config File
// ---------------------------------------------------------------------------------//

// NOTE: relative paths in an .iss file resolve relative to the .iss file
// itself (out/), so "publish\*" points at out/publish.
const innoConfigFileContent = `
[Setup]
AppId=${config.appId}
AppName=${config.appName}
AppVersion=${config.version}
AppPublisher=${config.publisher}
AppComments=${config.shortDescription}
${config.AppPublisherURL ? `AppPublisherURL=${config.AppPublisherURL}` : ""}

DefaultDirName=${config.installation.directory}
DefaultGroupName=${config.appName}

OutputDir=Output
OutputBaseFilename=${config.outputBaseFilename.replace("{version}", config.version)}

ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin

WizardStyle=modern
SolidCompression=yes
Uninstallable=yes
UninstallDisplayIcon={app}\\${mainExecutableFilename}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "publish\\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\\Start Service"; Filename: "{app}\\${serviceExecutableFilename}"; Parameters: "start"; WorkingDir: "{app}"
Name: "{group}\\Stop Service"; Filename: "{app}\\${serviceExecutableFilename}"; Parameters: "stop"; WorkingDir: "{app}"
Name: "{group}\\Restart Service"; Filename: "{app}\\${serviceExecutableFilename}"; Parameters: "restart"; WorkingDir: "{app}"

[Run]
Filename: "{app}\\${serviceExecutableFilename}"; Parameters: "install"; Flags: runhidden waituntilterminated; StatusMsg: "Installing service..."
Filename: "{app}\\${serviceExecutableFilename}"; Parameters: "start"; Flags: runhidden waituntilterminated; StatusMsg: "Starting service..."

[UninstallRun]
Filename: "{app}\\${serviceExecutableFilename}"; Parameters: "stop"; Flags: runhidden waituntilterminated; RunOnceId: "StopService"
Filename: "{app}\\${serviceExecutableFilename}"; Parameters: "uninstall"; Flags: runhidden waituntilterminated; RunOnceId: "UninstallService"

[Code]
// On upgrade: stop and remove the old service first so files aren't locked
// and "install" in [Run] doesn't fail because the service already exists.
procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
  SvcExe: String;
begin
  if CurStep = ssInstall then
  begin
    SvcExe := ExpandConstant('{app}\\${serviceExecutableFilename}');
    if FileExists(SvcExe) then
    begin
      Exec(SvcExe, 'stop', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
      Exec(SvcExe, 'uninstall', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    end;
  end;
end;

[Messages]
FinishedLabel=Setup has finished installing [name] on your computer.%n%nThe service is running with these defaults:%n%nServer port: ${config.serverPort}%nBase URL: http://localhost:${config.serverPort}
`;

console.log(styleText("blue", "Generating Inno config file..."));
await writeFile(INNO_CONFIG_FILE_PATH, innoConfigFileContent);

// ---------------------------------------------------------------------------------//
// Compiling Inno Setup Config File
// ---------------------------------------------------------------------------------//

function innoCompile() {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      INNO_ISCC_BINARY_PATH,
      [path.resolve(INNO_CONFIG_FILE_PATH)],
      {
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    child.stdout.on("data", (data) => {
      process.stdout.write(data.toString());
    });

    child.stderr.on("data", (data) => {
      process.stderr.write(styleText("red", data.toString()));
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        console.log(styleText("red", `✖ Compilation failed (${code})`));
        reject(new Error(`Inno compilation failed with code ${code}`));
      }
    });
  });
}
console.log(styleText("blue", "Running Inno Compile...\n"));

// const now = performance.now();

await innoCompile();

// const seconds = now / 1000;

console.log(styleText("greenBright", `🎉 Installer Succefully Generated`));
