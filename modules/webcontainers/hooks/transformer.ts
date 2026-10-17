import {
  TemplateFolder,
  TemplateFile,
  TemplateItem,
} from "@/modules/playground/lib/path-to-json";

interface WebContainerFile {
  file: {
    contents: string;
  };
}

interface WebContainerDirectory {
  directory: {
    [key: string]: WebContainerFile | WebContainerDirectory;
  };
}

export type WebContainerFileSystem = Record<
  string,
  WebContainerFile | WebContainerDirectory
>;

export function transformToWebContainerFormat(
  template: TemplateFolder
): WebContainerFileSystem {
  if (!template || !Array.isArray(template.items)) {
    return {};
  }

  function processItem(
    item: TemplateItem
  ): WebContainerFile | WebContainerDirectory {
    if ("folderName" in item && item.folderName && Array.isArray(item.items)) {
      // This is a directory
      const directoryContents: WebContainerFileSystem = {};

      item.items.forEach((subItem) => {
        const key =
          "folderName" in subItem && subItem.folderName
            ? subItem.folderName
            : "fileExtension" in subItem && subItem.fileExtension
            ? `${subItem.filename}.${subItem.fileExtension}`
            : (subItem as TemplateFile).filename;
        directoryContents[key] = processItem(subItem);
      });

      return {
        directory: directoryContents,
      };
    } else {
      // This is a file
      const fileItem = item as TemplateFile;
      return {
        file: {
          contents: fileItem.content ?? "",
        },
      };
    }
  }

  const result: WebContainerFileSystem = {};

  template.items.forEach((item) => {
    const key =
      "folderName" in item && item.folderName
        ? item.folderName
        : "fileExtension" in item && item.fileExtension
        ? `${item.filename}.${item.fileExtension}`
        : (item as TemplateFile).filename;
    result[key] = processItem(item);
  });

  return result;
}