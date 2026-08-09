"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import PlaygroundEditor from "@/modules/playground/components/playground-editor";
import { useFileExplorer } from "@/modules/playground/hooks/useFileExplorer";
import { usePlayground } from "@/modules/playground/hooks/usePlayground";
import { TemplateFile } from "@/modules/playground/lib/path-to-json";

import {
  Bot,
  FileText,
  Save,
  Settings,
  X,
} from "lucide-react";

const MainPlaygroundPage = () => {
  const { id } = useParams<{ id: string }>();

  const [isPreviewVisible, setIsPreviewVisible] = useState(false);

  const {
    playgroundData,
    templateData,
    isLoading,
    error,
    saveTemplateData,
  } = usePlayground(id);

  const {
    setTemplateData,
    activeFileId,
    setActiveFileId,
    closeAllFiles,
    closeFile,
    openFile,
    openFiles,
  } = useFileExplorer();

  useEffect(() => {
    if (templateData && openFiles.length === 0) {
      setTemplateData(templateData);
    }
  }, [templateData, setTemplateData, openFiles.length]);

  const activeFile = openFiles.find(
    (file) => file.id === activeFileId
  );

  const hasUnsavedChanges = openFiles.some(
    (file) => file.hasUnsavedChanges
  );

  const handleFileSelect = (file: TemplateFile) => {
    openFile(file);
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center text-destructive">
        Failed to load playground.
      </div>
    );
  }

  return (
    <TooltipProvider>
      <SidebarInset>
        {/* Header */}
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />

          <Separator
            orientation="vertical"
            className="mr-2 h-4"
          />

          <div className="flex flex-1 items-center gap-2">
            <div className="flex flex-1 flex-col">
              <h1 className="text-sm font-medium">
                {playgroundData?.title || "Code Playground"}
              </h1>

              <p className="text-xs text-muted-foreground">
                {openFiles.length} File(s) Open
                {hasUnsavedChanges && " • Unsaved changes"}
              </p>
            </div>

            <div className="flex items-center gap-1">
              {/* Save Current File */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {}}
                    disabled={
                      !activeFile ||
                      !activeFile.hasUnsavedChanges
                    }
                  >
                    <Save className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>

                <TooltipContent>
                  Save (Ctrl+S)
                </TooltipContent>
              </Tooltip>

              {/* Save All */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {}}
                    disabled={!hasUnsavedChanges}
                  >
                    <Save className="h-4 w-4" />
                    All
                  </Button>
                </TooltipTrigger>

                <TooltipContent>
                  Save All (Ctrl+Shift+S)
                </TooltipContent>
              </Tooltip>

              {/* AI Assistant */}
              <Button
                variant="default"
                size="icon"
              >
                <Bot className="size-4" />
              </Button>

              {/* Settings */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() =>
                      setIsPreviewVisible(
                        !isPreviewVisible
                      )
                    }
                  >
                    {isPreviewVisible
                      ? "Hide"
                      : "Show"}{" "}
                    Preview
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem
                    onClick={closeAllFiles}
                  >
                    Close All Files
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="h-[calc(100vh-4rem)]">
          {openFiles.length > 0 ? (
            <div className="flex h-full flex-col">
              {/* File Tabs */}
              <div className="border-b bg-muted/30">
                <Tabs
                  value={activeFileId || ""}
                  onValueChange={setActiveFileId}
                >
                  <div className="flex items-center justify-between px-4 py-2">
                    <TabsList className="h-8 bg-transparent p-0">
                      {openFiles.map((file) => (
                        <TabsTrigger
                          key={file.id}
                          value={file.id}
                          className="group relative h-8 px-3 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                        >
                          <div className="flex items-center gap-2">
                            <FileText className="h-3 w-3" />

                            <span>
                              {file.filename}.
                              {file.fileExtension}
                            </span>

                            {/* Unsaved indicator */}
                            {file.hasUnsavedChanges && (
                              <span className="h-2 w-2 rounded-full bg-orange-500" />
                            )}

                            {/* Close file */}
                            <span
                              className="ml-2 flex h-4 w-4 cursor-pointer items-center justify-center rounded-sm opacity-0 transition-opacity hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                closeFile(file.id);
                              }}
                            >
                              <X className="h-3 w-3" />
                            </span>
                          </div>
                        </TabsTrigger>
                      ))}
                    </TabsList>

                    {/* Close All */}
                    {openFiles.length > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={closeAllFiles}
                        className="h-6 px-2 text-xs"
                      >
                        Close All
                      </Button>
                    )}
                  </div>
                </Tabs>
              </div>

              {/* Editor */}
              <div className="flex-1">
                <ResizablePanelGroup
                  direction="horizontal"
                  className="h-full"
                >
                  <ResizablePanel
                    defaultSize={
                      isPreviewVisible ? 50 : 100
                    }
                  >
                    <PlaygroundEditor
                      activeFile={activeFile}
                      content={
                        activeFile?.content || ""
                      }
                      onContentChange={() => {}}
                    />
                  </ResizablePanel>
                </ResizablePanelGroup>
              </div>
            </div>
          ) : (
            /* No Files Open */
            <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
              <FileText className="h-16 w-16 text-gray-300" />

              <div className="text-center">
                <p className="text-lg font-medium">
                  No files open
                </p>

                <p className="text-sm text-gray-500">
                  Select a file from the sidebar to
                  start editing
                </p>
              </div>
            </div>
          )}
        </div>
      </SidebarInset>
    </TooltipProvider>
  );
};

export default MainPlaygroundPage;