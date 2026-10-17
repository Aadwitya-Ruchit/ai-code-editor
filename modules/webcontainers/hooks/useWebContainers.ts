import { useState, useEffect, useCallback } from "react";
import { WebContainer } from "@webcontainer/api";
import { TemplateFolder } from "@/modules/playground/lib/path-to-json";

interface UseWebContainerProps {
  templateData?: TemplateFolder;
}

interface UseWebContaierReturn {
  serverUrl: string | null;
  isLoading: boolean;
  error: string | null;
  instance: WebContainer | null;
  writeFileSync: (path: string, content: string) => Promise<void>;
  destroy: () => void;
}

// Module-level singleton to prevent "Only a single WebContainer instance can be booted" error
let webcontainerInstancePromise: Promise<WebContainer> | null = null;
let webcontainerInstance: WebContainer | null = null;

export async function getWebContainer(): Promise<WebContainer> {
  if (webcontainerInstance) {
    return webcontainerInstance;
  }

  if (!webcontainerInstancePromise) {
    webcontainerInstancePromise = WebContainer.boot({ coep: "require-corp" })
      .then((instance) => {
        webcontainerInstance = instance;
        return instance;
      })
      .catch((err) => {
        webcontainerInstancePromise = null;
        webcontainerInstance = null;
        throw err;
      });
  }

  return webcontainerInstancePromise;
}

export const useWebContainer = ({
  templateData,
}: UseWebContainerProps): UseWebContaierReturn => {
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(!webcontainerInstance);
  const [error, setError] = useState<string | null>(null);
  const [instance, setInstance] = useState<WebContainer | null>(webcontainerInstance);

  useEffect(() => {
    let mounted = true;

    if (webcontainerInstance) {
      setInstance(webcontainerInstance);
      setIsLoading(false);
      return;
    }

    getWebContainer()
      .then((webcontainer) => {
        if (!mounted) return;
        setInstance(webcontainer);
        setIsLoading(false);

        // Listen for server-ready
        webcontainer.on("server-ready", (port: number, url: string) => {
          if (mounted) {
            setServerUrl(url);
          }
        });
      })
      .catch((err) => {
        console.error("Failed to initialize WebContainer:", err);
        if (mounted) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to initialize WebContainer"
          );
          setIsLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const writeFileSync = useCallback(
    async (path: string, content: string): Promise<void> => {
      const activeInstance = instance || webcontainerInstance;
      if (!activeInstance) {
        throw new Error("WebContainer instance is not available");
      }

      try {
        const pathParts = path.split("/");
        const folderPath = pathParts.slice(0, -1).join("/");

        if (folderPath) {
          await activeInstance.fs.mkdir(folderPath, { recursive: true });
        }

        await activeInstance.fs.writeFile(path, content);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to write file";
        console.error(`Failed to write file at ${path}:`, err);
        throw new Error(`Failed to write file at ${path}: ${errorMessage}`);
      }
    },
    [instance]
  );

  const destroy = useCallback(() => {
    if (webcontainerInstance) {
      webcontainerInstance.teardown();
      webcontainerInstance = null;
      webcontainerInstancePromise = null;
    }
    setInstance(null);
    setServerUrl(null);
  }, []);

  return { serverUrl, isLoading, error, instance, writeFileSync, destroy };
};