import JSZip from "jszip";
import { TemplateFile, TemplateFolder } from "@/modules/playground/lib/path-to-json";

export interface GithubRepoMetadata {
  owner: string;
  repo: string;
  name: string;
  description: string | null;
  defaultBranch: string;
  stars: number;
  forks: number;
  language: string | null;
  isPrivate: boolean;
  sizeKb: number;
}

export interface ExtractedRepoResult {
  templateData: TemplateFolder;
  detectedTemplate: "REACT" | "NEXTJS" | "EXPRESS" | "VUE" | "HONO" | "ANGULAR";
  fileCount: number;
  totalSizeBytes: number;
}

// Allowed characters in owner and repo names
const GITHUB_NAME_REGEX = /^[a-zA-Z0-9_.-]+$/;

// Directories to skip during repository extraction
const IGNORED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  "out",
  ".output",
  ".turbo",
  ".cache",
  ".vscode",
  ".idea",
  "coverage",
]);

// Binary / media extensions to skip
const BINARY_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "ico", "bmp", "tiff",
  "mp4", "webm", "ogg", "mp3", "wav",
  "pdf", "zip", "tar", "gz", "7z", "rar", "wasm",
  "exe", "dll", "so", "dylib", "bin", "iso", "dmg"
]);

// Safety caps
const MAX_TOTAL_FILES = 800;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 20 * 1024 * 1024; // 20 MB
const MAX_SINGLE_FILE_BYTES = 600 * 1024; // 600 KB

/**
 * Parses and sanitizes a GitHub repository URL or shorthand (e.g. owner/repo).
 * Strictly guards against SSRF, non-github hosts, and invalid path inputs.
 */
export function parseGithubUrl(rawUrl: string): { owner: string; repo: string; branch?: string } {
  if (!rawUrl || typeof rawUrl !== "string") {
    throw new Error("GitHub repository URL is required.");
  }

  const clean = rawUrl.trim();

  // Guard against path traversal sequences
  if (clean.includes("..") || clean.includes("%2e") || clean.includes("%2E")) {
    throw new Error("Invalid URL: path traversal sequences are not permitted.");
  }

  // Support shorthand: "owner/repo" or "owner/repo@branch"
  if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+(@[a-zA-Z0-9_.-]+)?$/.test(clean)) {
    const [pathPart, branchPart] = clean.split("@");
    const [owner, repo] = pathPart.split("/");
    return { owner, repo, branch: branchPart || undefined };
  }

  // Parse as URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(clean.startsWith("http") ? clean : `https://${clean}`);
  } catch {
    throw new Error("Invalid URL format. Please provide a valid GitHub repository URL.");
  }

  // Guard: Hostname must strictly be github.com
  if (parsedUrl.hostname !== "github.com" && parsedUrl.hostname !== "www.github.com") {
    throw new Error("Invalid host. Only repositories hosted on github.com are supported.");
  }

  // Pathname: "/owner/repo" or "/owner/repo/tree/branch"
  const segments = parsedUrl.pathname.replace(/^\/+|\/+$/g, "").split("/");
  if (segments.length < 2) {
    throw new Error("URL must include both the repository owner and name (e.g. https://github.com/owner/repo).");
  }

  const [owner, repoWithGit] = segments;
  const repo = repoWithGit.replace(/\.git$/, "");

  if (!GITHUB_NAME_REGEX.test(owner) || !GITHUB_NAME_REGEX.test(repo)) {
    throw new Error("Repository owner or name contains invalid characters.");
  }

  let branch: string | undefined;
  if (segments[2] === "tree" && segments[3]) {
    // Branch may be nested like tree/feature/new-ui
    branch = segments.slice(3).join("/");
  }

  return { owner, repo, branch };
}

/**
 * Fetches repository metadata from GitHub REST API.
 * Uses optional access token for increased rate limits or private repo access.
 */
export async function fetchGithubMetadata(
  owner: string,
  repo: string,
  token?: string
): Promise<GithubRepoMetadata> {
  const headers: HeadersInit = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "AICodeEditor-Github-Importer",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers,
    cache: "no-store",
  });

  if (response.status === 404) {
    throw new Error(
      token
        ? `Repository '${owner}/${repo}' not found on GitHub.`
        : `Repository '${owner}/${repo}' not found or is private. If it is private, please sign in with your GitHub account.`
    );
  }

  if (response.status === 403) {
    const rateLimitRemaining = response.headers.get("x-ratelimit-remaining");
    if (rateLimitRemaining === "0") {
      throw new Error(
        "GitHub API rate limit exceeded. Please sign in with your GitHub account to authenticate requests or try again later."
      );
    }
    throw new Error("Access to this repository is forbidden by GitHub.");
  }

  if (!response.ok) {
    throw new Error(`GitHub API request failed with status: ${response.status}`);
  }

  const data = await response.json();

  return {
    owner: data.owner?.login || owner,
    repo: data.name || repo,
    name: data.name || repo,
    description: data.description || null,
    defaultBranch: data.default_branch || "main",
    stars: data.stargazers_count || 0,
    forks: data.forks_count || 0,
    language: data.language || null,
    isPrivate: !!data.private,
    sizeKb: data.size || 0,
  };
}

/**
 * Downloads repository archive (zipball), unzips into memory, filters binaries/ignored dirs,
 * and builds the recursive TemplateFolder structure for WebContainer.
 */
export async function downloadAndExtractGithubRepo(
  owner: string,
  repo: string,
  branch: string,
  token?: string
): Promise<ExtractedRepoResult> {
  const headers: HeadersInit = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "AICodeEditor-Github-Importer",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const zipUrl = `https://api.github.com/repos/${owner}/${repo}/zipball/${encodeURIComponent(branch)}`;
  const response = await fetch(zipUrl, {
    headers,
    redirect: "follow",
    cache: "no-store",
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Branch '${branch}' or repository '${owner}/${repo}' not found.`);
    }
    throw new Error(`Failed to download repository archive from GitHub (Status ${response.status}).`);
  }

  const buffer = await response.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);

  // GitHub zip archives have a root folder like "owner-repo-commitSha/"
  // Identify and strip this top-level prefix
  const zipFiles = Object.values(zip.files);
  const rootEntry = zipFiles.find((entry) => entry.dir);
  const rootPrefix = rootEntry ? rootEntry.name.split("/")[0] + "/" : "";

  // In-memory directory tree representation
  interface FolderNode {
    folderName: string;
    folders: Map<string, FolderNode>;
    files: TemplateFile[];
  }

  const rootNode: FolderNode = {
    folderName: "Root",
    folders: new Map(),
    files: [],
  };

  let fileCount = 0;
  let totalSizeBytes = 0;
  let packageJsonContent: string | null = null;

  for (const file of zipFiles) {
    if (file.dir) continue;

    // Relative path without GitHub root folder
    let relativePath = file.name;
    if (rootPrefix && relativePath.startsWith(rootPrefix)) {
      relativePath = relativePath.slice(rootPrefix.length);
    }

    if (!relativePath || relativePath.startsWith("/") || relativePath.includes("../")) {
      // Path traversal or empty guard
      continue;
    }

    const segments = relativePath.split("/");
    const fileNameWithExt = segments[segments.length - 1];
    const dirSegments = segments.slice(0, -1);

    // Skip ignored directories
    if (dirSegments.some((dir) => IGNORED_DIRECTORIES.has(dir))) {
      continue;
    }

    // Skip binary extensions
    const extMatch = fileNameWithExt.match(/\.([a-zA-Z0-9_-]+)$/);
    const extension = extMatch ? extMatch[1].toLowerCase() : "";
    if (BINARY_EXTENSIONS.has(extension)) {
      continue;
    }

    // File count ceiling
    if (fileCount >= MAX_TOTAL_FILES) {
      break;
    }

    // Read content as utf-8 string
    const content = await file.async("string");
    const contentSize = Buffer.byteLength(content, "utf8");

    // Skip oversized individual files
    if (contentSize > MAX_SINGLE_FILE_BYTES) {
      continue;
    }

    totalSizeBytes += contentSize;
    if (totalSizeBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new Error(
        `Repository size exceeds the ${MAX_TOTAL_UNCOMPRESSED_BYTES / (1024 * 1024)}MB text limit for in-browser runtime.`
      );
    }

    // Capture package.json for framework detection
    if (relativePath === "package.json") {
      packageJsonContent = content;
    }

    // Separate base name and extension
    let filename = fileNameWithExt;
    let fileExtension = "";
    if (extMatch) {
      fileExtension = extension;
      filename = fileNameWithExt.slice(0, -(fileExtension.length + 1));
    }

    // Traverse or create folder nodes
    let currentNode = rootNode;
    for (const folderName of dirSegments) {
      if (!currentNode.folders.has(folderName)) {
        currentNode.folders.set(folderName, {
          folderName,
          folders: new Map(),
          files: [],
        });
      }
      currentNode = currentNode.folders.get(folderName)!;
    }

    currentNode.files.push({
      filename,
      fileExtension,
      content,
    });

    fileCount++;
  }

  if (fileCount === 0) {
    throw new Error("No compatible code files found in this repository archive.");
  }

  // Convert FolderNode tree into canonical TemplateFolder structure
  function convertToTemplateFolder(node: FolderNode): TemplateFolder {
    const items: (TemplateFile | TemplateFolder)[] = [];

    // Sort folders alphabetically
    const sortedFolders = Array.from(node.folders.values()).sort((a, b) =>
      a.folderName.localeCompare(b.folderName)
    );
    for (const folder of sortedFolders) {
      items.push(convertToTemplateFolder(folder));
    }

    // Sort files alphabetically
    const sortedFiles = [...node.files].sort((a, b) =>
      `${a.filename}.${a.fileExtension}`.localeCompare(`${b.filename}.${b.fileExtension}`)
    );
    for (const file of sortedFiles) {
      items.push(file);
    }

    return {
      folderName: node.folderName,
      items,
    };
  }

  const templateData = convertToTemplateFolder(rootNode);

  // Framework detection
  const detectedTemplate = detectTemplateFromPackageJson(packageJsonContent);

  return {
    templateData,
    detectedTemplate,
    fileCount,
    totalSizeBytes,
  };
}

/**
 * Analyzes package.json to identify the project framework.
 */
function detectTemplateFromPackageJson(
  packageJsonRaw: string | null
): "REACT" | "NEXTJS" | "EXPRESS" | "VUE" | "HONO" | "ANGULAR" {
  if (!packageJsonRaw) return "REACT";

  try {
    const pkg = JSON.parse(packageJsonRaw);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    if (deps["next"]) return "NEXTJS";
    if (deps["vue"] || deps["@vitejs/plugin-vue"] || deps["nuxt"]) return "VUE";
    if (deps["express"]) return "EXPRESS";
    if (deps["hono"] || deps["@hono/node-server"]) return "HONO";
    if (deps["@angular/core"]) return "ANGULAR";
    if (deps["react"]) return "REACT";
  } catch {
    // ignore parse error and fallback
  }

  return "REACT";
}
