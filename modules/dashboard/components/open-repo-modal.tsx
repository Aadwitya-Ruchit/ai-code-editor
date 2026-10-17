"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  GitBranch,
  Star,
  GitFork,
  Loader2,
  AlertCircle,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";
import { FaGithub } from "react-icons/fa";
import { toast } from "sonner";
import { getGithubRepoPreview, importGithubRepo } from "../actions";

interface OpenRepoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface RepoPreviewData {
  owner: string;
  repo: string;
  name: string;
  description: string | null;
  defaultBranch: string;
  requestedBranch: string;
  stars: number;
  forks: number;
  language: string | null;
  isPrivate: boolean;
  sizeKb: number;
}

export const OpenRepoModal: React.FC<OpenRepoModalProps> = ({
  isOpen,
  onClose,
}) => {
  const router = useRouter();
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [customTitle, setCustomTitle] = useState("");

  const [previewData, setPreviewData] = useState<RepoPreviewData | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [isImporting, setIsImporting] = useState(false);
  const [importStatusStep, setImportStatusStep] = useState<string>("");

  // Reset state when modal is closed
  useEffect(() => {
    if (!isOpen) {
      setRepoUrl("");
      setBranch("");
      setCustomTitle("");
      setPreviewData(null);
      setPreviewError(null);
      setIsImporting(false);
      setImportStatusStep("");
    }
  }, [isOpen]);

  // Validate and fetch preview
  const handleFetchPreview = async (urlToFetch?: string) => {
    const targetUrl = (urlToFetch || repoUrl).trim();
    if (!targetUrl) return;

    setIsPreviewLoading(true);
    setPreviewError(null);
    setPreviewData(null);

    try {
      const res = await getGithubRepoPreview(targetUrl);
      if (res.success && res.metadata) {
        setPreviewData(res.metadata as RepoPreviewData);
        if (!branch) {
          setBranch(res.metadata.requestedBranch || res.metadata.defaultBranch);
        }
        if (!customTitle) {
          setCustomTitle(res.metadata.name);
        }
      } else {
        setPreviewError(res.error || "Failed to load repository preview.");
      }
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Network error validating repository.");
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleImport = async () => {
    if (!repoUrl.trim()) {
      toast.error("Please enter a GitHub repository URL.");
      return;
    }

    setIsImporting(true);
    setImportStatusStep("Validating repository & branches...");

    try {
      setImportStatusStep("Downloading repository archive...");
      const result = await importGithubRepo({
        url: repoUrl.trim(),
        branch: branch.trim() || undefined,
        customTitle: customTitle.trim() || undefined,
      });

      setImportStatusStep("Setting up playground...");
      toast.success(
        `Imported ${result.fileCount} files successfully! Opening playground...`
      );

      onClose();
      router.push(`/playground/${result.playgroundId}`);
    } catch (error) {
      console.error("Import error:", error);
      const message = error instanceof Error ? error.message : "Failed to import repository.";
      toast.error(message);
    } finally {
      setIsImporting(false);
      setImportStatusStep("");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !isImporting && !open && onClose()}>
      <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900">
              <FaGithub className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-xl">Open GitHub Repository</DialogTitle>
              <DialogDescription className="text-xs">
                Import any public or authorized private repository directly into the browser playground.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Repository URL Input */}
          <div className="space-y-1.5">
            <Label htmlFor="repo-url" className="text-xs font-semibold">
              Repository URL or Shorthand
            </Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="repo-url"
                  placeholder="e.g. facebook/react or https://github.com/expressjs/express"
                  value={repoUrl}
                  onChange={(e) => {
                    setRepoUrl(e.target.value);
                    if (previewError) setPreviewError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleFetchPreview();
                    }
                  }}
                  disabled={isImporting}
                  className="text-xs"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleFetchPreview()}
                disabled={!repoUrl.trim() || isPreviewLoading || isImporting}
                className="text-xs shrink-0"
              >
                {isPreviewLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "Inspect"
                )}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Supports full URLs (`https://github.com/owner/repo`) or shorthand (`owner/repo`).
            </p>
          </div>

          {/* Error Message */}
          {previewError && (
            <div className="flex items-start gap-2 p-3 text-xs bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-900/50">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">Cannot access repository</p>
                <p className="text-[11px] mt-0.5 opacity-90">{previewError}</p>
              </div>
            </div>
          )}

          {/* Repository Preview Card */}
          {previewData && (
            <div className="rounded-lg border bg-card p-3.5 space-y-2 text-xs shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-semibold text-sm">
                  <FaGithub className="h-4 w-4" />
                  <a
                    href={`https://github.com/${previewData.owner}/${previewData.repo}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline flex items-center gap-1 text-primary"
                  >
                    {previewData.owner}/{previewData.repo}
                    <ExternalLink className="h-3 w-3 opacity-60" />
                  </a>
                </div>
                {previewData.isPrivate ? (
                  <Badge variant="secondary" className="text-[10px]">Private</Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">Public</Badge>
                )}
              </div>

              {previewData.description && (
                <p className="text-muted-foreground text-[11px] line-clamp-2">
                  {previewData.description}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-muted-foreground border-t">
                {previewData.language && (
                  <div className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-blue-500" />
                    <span>{previewData.language}</span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <Star className="h-3 w-3 text-amber-500" />
                  <span>{previewData.stars.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-1">
                  <GitFork className="h-3 w-3" />
                  <span>{previewData.forks.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-1">
                  <GitBranch className="h-3 w-3" />
                  <span>{previewData.defaultBranch}</span>
                </div>
              </div>
            </div>
          )}

          {/* Optional Branch & Title configuration */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="space-y-1">
              <Label htmlFor="repo-branch" className="text-xs">
                Branch (Optional)
              </Label>
              <div className="relative">
                <GitBranch className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  id="repo-branch"
                  placeholder={previewData?.defaultBranch || "main"}
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  disabled={isImporting}
                  className="pl-8 text-xs h-8"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="custom-title" className="text-xs">
                Playground Title
              </Label>
              <Input
                id="custom-title"
                placeholder={previewData?.name || "Repository Title"}
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                disabled={isImporting}
                className="text-xs h-8"
              />
            </div>
          </div>

          {/* Live Import Status Indicator */}
          {isImporting && (
            <div className="p-3 bg-muted/60 rounded-lg border text-xs space-y-1.5 animate-pulse">
              <div className="flex items-center gap-2 text-primary font-medium">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{importStatusStep}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Extracting files and initializing WebContainer runtime...
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={isImporting}
            className="text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleImport}
            disabled={!repoUrl.trim() || isImporting || isPreviewLoading}
            className="text-xs gap-1.5"
          >
            {isImporting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                Open in Playground
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OpenRepoModal;
