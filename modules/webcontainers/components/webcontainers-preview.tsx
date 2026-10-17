"use client";
import React, { useEffect, useState, useRef } from "react";

import { transformToWebContainerFormat } from "../hooks/transformer";
import { CheckCircle, Loader2, XCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";

import { WebContainer } from "@webcontainer/api";
import { TemplateFolder } from "@/modules/playground/lib/path-to-json";
import TerminalComponent from "./terminal";

interface WebContainerPreviewProps {
  templateData: TemplateFolder;
  serverUrl: string;
  isLoading: boolean;
  error: string | null;
  instance: WebContainer | null;
  writeFileSync: (path: string, content: string) => Promise<void>;
  forceResetup?: boolean; // Optional prop to force re-setup
}
const WebContainerPreview = ({
  templateData,
  error,
  instance,
  isLoading,
  serverUrl,
  writeFileSync,
  forceResetup = false,
}: WebContainerPreviewProps) => {
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [loadingState, setLoadingState] = useState({
    transforming: false,
    mounting: false,
    installing: false,
    starting: false,
    ready: false,
  });
  const [currentStep, setCurrentStep] = useState(0);
  const totalSteps = 4;
  const [setupError, setSetupError] = useState<string | null>(null);
  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const [isSetupInProgress, setIsSetupInProgress] = useState(false);

  const terminalRef = useRef<any>(null);

  // Reset setup state when forceResetup changes
  useEffect(() => {
    if (forceResetup) {
      setIsSetupComplete(false);
      setIsSetupInProgress(false);
      setPreviewUrl("");
      setCurrentStep(0);
      setLoadingState({
        transforming: false,
        mounting: false,
        installing: false,
        starting: false,
        ready: false,
      });
    }
  }, [forceResetup]);

  useEffect(() => {
    async function setupContainer() {
      if (!instance || !templateData || isSetupComplete || isSetupInProgress) return;

      try {
        setIsSetupInProgress(true);
        setSetupError(null);

        // Check if files are already mounted in this instance
        let packageJsonExists = false;
        try {
          await instance.fs.readFile("package.json", "utf8");
          packageJsonExists = true;
        } catch {}

        if (packageJsonExists && !forceResetup) {
          terminalRef.current?.writeToTerminal(
            "🔄 Reconnected to existing WebContainer session...\r\n"
          );
          setIsSetupComplete(true);
          setIsSetupInProgress(false);
          setLoadingState({
            transforming: false,
            mounting: false,
            installing: false,
            starting: false,
            ready: true,
          });
          return;
        }

        // Step 1: Transform template data
        setLoadingState((prev) => ({ ...prev, transforming: true }));
        setCurrentStep(1);
        terminalRef.current?.writeToTerminal("\r\n🔄 Transforming template data...\r\n");

        const files = transformToWebContainerFormat(templateData);

        setLoadingState((prev) => ({
          ...prev,
          transforming: false,
          mounting: true,
        }));
        setCurrentStep(2);

        // Step 2: Mount files to WebContainer
        terminalRef.current?.writeToTerminal("📁 Mounting files to WebContainer...\r\n");
        await instance.mount(files);
        terminalRef.current?.writeToTerminal("✅ Files mounted successfully\r\n");

        setLoadingState((prev) => ({
          ...prev,
          mounting: false,
          installing: true,
        }));
        setCurrentStep(3);

        // Step 3: Install dependencies
        terminalRef.current?.writeToTerminal("📦 Installing dependencies (npm install)...\r\n");
        const installProcess = await instance.spawn("npm", ["install"]);
        installProcess.output.pipeTo(
          new WritableStream({
            write(data) {
              terminalRef.current?.writeToTerminal(data);
            },
          })
        );

        const installExitCode = await installProcess.exit;
        if (installExitCode !== 0) {
          throw new Error(`npm install failed with exit code: ${installExitCode}`);
        }

        terminalRef.current?.writeToTerminal("✅ Dependencies installed successfully\r\n");
        setLoadingState((prev) => ({
          ...prev,
          installing: false,
          starting: true,
        }));
        setCurrentStep(4);

        // Step 4: Start development server
        instance.on("server-ready", (port: number, url: string) => {
          terminalRef.current?.writeToTerminal(`\r\n🌐 Server ready at ${url}\r\n`);
          setPreviewUrl(url);
          setLoadingState((prev) => ({
            ...prev,
            starting: false,
            ready: true,
          }));
          setIsSetupComplete(true);
          setIsSetupInProgress(false);
        });

        // Determine start command from package.json
        let startArgs = ["run", "start"];
        try {
          const pkgRaw = await instance.fs.readFile("package.json", "utf8");
          const pkg = JSON.parse(pkgRaw);
          if (pkg.scripts?.dev) {
            startArgs = ["run", "dev"];
          } else if (pkg.scripts?.start) {
            startArgs = ["run", "start"];
          }
        } catch {
          // fallback to npm run start
        }

        terminalRef.current?.writeToTerminal(`🚀 Starting server (npm ${startArgs.join(" ")})...\r\n`);
        const startProcess = await instance.spawn("npm", startArgs);
        startProcess.output.pipeTo(
          new WritableStream({
            write(data) {
              terminalRef.current?.writeToTerminal(data);
            },
          })
        );

        startProcess.exit.then((code) => {
          if (code !== 0) {
            terminalRef.current?.writeToTerminal(`\r\n⚠️ Dev server process exited with code: ${code}\r\n`);
          }
          setIsSetupInProgress(false);
        });

      } catch (err) {
        console.error("Error setting up container:", err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        terminalRef.current?.writeToTerminal(`\r\n❌ Error: ${errorMessage}\r\n`);
        setSetupError(errorMessage);
        setIsSetupInProgress(false);
        setLoadingState({
          transforming: false,
          mounting: false,
          installing: false,
          starting: false,
          ready: false,
        });
      }
    }

    setupContainer();
  }, [instance, templateData, isSetupComplete, isSetupInProgress, forceResetup]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md p-6 rounded-lg bg-gray-50 dark:bg-gray-900 border">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
          <h3 className="text-lg font-medium">Initializing WebContainer</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Setting up the browser runtime environment...
          </p>
        </div>
      </div>
    );
  }

  if (error || setupError) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-6 rounded-lg max-w-md border border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2 mb-3">
            <XCircle className="h-5 w-5 flex-shrink-0" />
            <h3 className="font-semibold">WebContainer Error</h3>
          </div>
          <p className="text-sm whitespace-pre-wrap">{error || setupError}</p>
        </div>
      </div>
    );
  }

  const getStepIcon = (stepIndex: number) => {
    if (stepIndex < currentStep) {
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    } else if (stepIndex === currentStep) {
      return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
    } else {
      return <div className="h-5 w-5 rounded-full border-2 border-gray-300 dark:border-gray-600" />;
    }
  };

  const getStepText = (stepIndex: number, label: string) => {
    const isActive = stepIndex === currentStep;
    const isComplete = stepIndex < currentStep;

    return (
      <span
        className={`text-sm font-medium ${
          isComplete
            ? "text-green-600 dark:text-green-400"
            : isActive
            ? "text-blue-600 dark:text-blue-400"
            : "text-gray-500 dark:text-gray-400"
        }`}
      >
        {label}
      </span>
    );
  };

  return (
    <div className="h-full w-full flex flex-col">
      {/* Top Section: Live preview iframe or Setup Progress Indicator */}
      <div className="flex-1 min-h-0 relative">
        {previewUrl ? (
          <iframe
            src={previewUrl}
            className="w-full h-full border-none"
            title="WebContainer Preview"
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center p-4 overflow-auto">
            <div className="w-full max-w-md p-6 rounded-lg bg-white dark:bg-zinc-850 shadow-sm border">
              <Progress
                value={(currentStep / totalSteps) * 100}
                className="h-2 mb-6"
              />

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  {getStepIcon(1)}
                  {getStepText(1, "Transforming template data")}
                </div>
                <div className="flex items-center gap-3">
                  {getStepIcon(2)}
                  {getStepText(2, "Mounting files")}
                </div>
                <div className="flex items-center gap-3">
                  {getStepIcon(3)}
                  {getStepText(3, "Installing dependencies")}
                </div>
                <div className="flex items-center gap-3">
                  {getStepIcon(4)}
                  {getStepText(4, "Starting development server")}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Section: Terminal (keeps mounted across full session) */}
      <div className="h-64 border-t flex-shrink-0">
        <TerminalComponent
          ref={terminalRef}
          webContainerInstance={instance}
          theme="dark"
          className="h-full"
        />
      </div>
    </div>
  );
};

export default WebContainerPreview;