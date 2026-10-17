"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/modules/auth/actions";
import { revalidatePath } from "next/cache";
import { logSecurityEvent } from "@/lib/security-logger";

export const getAllPlaygroundForUser = async () => {
  const user = await currentUser();
  if (!user?.id) {
    return [];
  }

  try {
    const playground = await db.playground.findMany({
      where: {
        userId: user.id,
      },
      include: {
        user: true,
        Starmark: true,
      },
      orderBy: {
        updatedAt: "desc",
      },
    });
    return playground;
  } catch (error) {
    console.error("Error fetching playgrounds for user:", error);
    return [];
  }
};

export const createPlayground = async (data: {
  title: string;
  template: "REACT" | "NEXTJS" | "EXPRESS" | "VUE" | "HONO" | "ANGULAR";
  description?: string;
}) => {
  const user = await currentUser();
  if (!user?.id) {
    throw new Error("Unauthorized. Please sign in to create a playground.");
  }

  const rawTitle = typeof data.title === "string" ? data.title.trim() : "";
  const title = rawTitle.slice(0, 100) || "Untitled Playground";
  const description =
    typeof data.description === "string"
      ? data.description.trim().slice(0, 500)
      : undefined;

  const validTemplates = ["REACT", "NEXTJS", "EXPRESS", "VUE", "HONO", "ANGULAR"];
  if (!validTemplates.includes(data.template)) {
    throw new Error("Invalid template selected.");
  }

  try {
    const playground = await db.playground.create({
      data: {
        title,
        description,
        template: data.template,
        userId: user.id,
      },
    });
    return playground;
  } catch (error) {
    console.error("Error creating playground:", error);
    throw new Error("Failed to create playground.");
  }
};

export const deleteProjectById = async (id: string) => {
  const user = await currentUser();
  if (!user?.id) {
    throw new Error("Unauthorized. Please sign in to delete a project.");
  }

  if (!id || typeof id !== "string") {
    throw new Error("Invalid project ID provided.");
  }

  // Enforce ownership: only the owner can delete the playground
  const existing = await db.playground.findFirst({
    where: {
      id,
      userId: user.id,
    },
  });

  if (!existing) {
    logSecurityEvent("UNAUTHORIZED_ACCESS_ATTEMPT", {
      userId: user.id,
      targetId: id,
      endpoint: "deleteProjectById",
      reason: "Attempted to delete a project not owned by user",
    });
    throw new Error("Project not found or access denied.");
  }

  try {
    // Delete associated template files and starmarks safely
    await db.templateFile.deleteMany({
      where: { playgroundId: id },
    });
    await db.starMark.deleteMany({
      where: { playgroundId: id },
    });
    await db.playground.delete({
      where: {
        id,
      },
    });
    revalidatePath("/dashboard");
    return;
  } catch (error) {
    console.error("Error deleting project:", error);
    throw new Error("Failed to delete project.");
  }
};

export const editProjectById = async (
  id: string,
  data: { title: string; description: string }
) => {
  const user = await currentUser();
  if (!user?.id) {
    throw new Error("Unauthorized. Please sign in to edit a project.");
  }

  if (!id || typeof id !== "string") {
    throw new Error("Invalid project ID provided.");
  }

  // Enforce ownership: only the owner can edit the playground
  const existing = await db.playground.findFirst({
    where: {
      id,
      userId: user.id,
    },
  });

  if (!existing) {
    logSecurityEvent("UNAUTHORIZED_ACCESS_ATTEMPT", {
      userId: user.id,
      targetId: id,
      endpoint: "editProjectById",
      reason: "Attempted to edit a project not owned by user",
    });
    throw new Error("Project not found or access denied.");
  }

  const title =
    typeof data.title === "string" && data.title.trim()
      ? data.title.trim().slice(0, 100)
      : existing.title;
  const description =
    typeof data.description === "string"
      ? data.description.trim().slice(0, 500)
      : existing.description;

  try {
    await db.playground.update({
      where: {
        id,
      },
      data: {
        title,
        description,
      },
    });
    revalidatePath("/dashboard");
    return;
  } catch (error) {
    console.error("Error editing project:", error);
    throw new Error("Failed to edit project.");
  }
};

export const duplicateProjectById = async (id: string) => {
  const user = await currentUser();
  if (!user?.id) {
    throw new Error("Unauthorized. Please sign in to duplicate a project.");
  }

  if (!id || typeof id !== "string") {
    throw new Error("Invalid project ID provided.");
  }

  // Enforce ownership: only the owner can duplicate their project
  const originalPlayground = await db.playground.findFirst({
    where: {
      id,
      userId: user.id,
    },
    include: {
      templateFiles: true,
    },
  });

  if (!originalPlayground) {
    logSecurityEvent("UNAUTHORIZED_ACCESS_ATTEMPT", {
      userId: user.id,
      targetId: id,
      endpoint: "duplicateProjectById",
      reason: "Attempted to duplicate a project not owned by user",
    });
    throw new Error("Project not found or access denied.");
  }

  try {
    const duplicatedPlayground = await db.playground.create({
      data: {
        title: `${originalPlayground.title} (Copy)`.slice(0, 100),
        description: originalPlayground.description,
        template: originalPlayground.template,
        userId: user.id,
        templateFiles:
          originalPlayground.templateFiles.length > 0
            ? {
                create: {
                  content: originalPlayground.templateFiles[0].content as any,
                },
              }
            : undefined,
      },
    });

    revalidatePath("/dashboard");
    return duplicatedPlayground;
  } catch (error) {
    console.error("Error duplicating project:", error);
    throw new Error("Failed to duplicate project.");
  }
};

export const toggleStarMarked = async (
  playgroundId: string,
  isChecked: boolean
) => {
  const user = await currentUser();
  if (!user?.id) {
    throw new Error("Unauthorized. Please sign in.");
  }

  if (!playgroundId || typeof playgroundId !== "string") {
    throw new Error("Invalid playground ID provided.");
  }

  // Verify playground exists before creating/deleting star mark
  const playground = await db.playground.findUnique({
    where: { id: playgroundId },
  });

  if (!playground) {
    throw new Error("Playground not found.");
  }

  try {
    if (isChecked) {
      await db.starMark.upsert({
        where: {
          userId_playgroundId: {
            userId: user.id,
            playgroundId,
          },
        },
        create: {
          userId: user.id,
          playgroundId,
          isMarked: true,
        },
        update: {
          isMarked: true,
        },
      });
    } else {
      await db.starMark.deleteMany({
        where: {
          userId: user.id,
          playgroundId,
        },
      });
    }

    revalidatePath("/dashboard");
    return { success: true, isMarked: isChecked };
  } catch (error) {
    console.error("Error updating star mark:", error);
    return { success: false, error: "Failed to update star mark status." };
  }
};

/**
 * Validates a GitHub URL and fetches repository metadata for preview before importing.
 */
export const getGithubRepoPreview = async (rawUrl: string) => {
  const user = await currentUser();
  if (!user?.id) {
    return { success: false, error: "Unauthorized. Please sign in to import a repository." };
  }

  try {
    const { parseGithubUrl, fetchGithubMetadata } = await import("./github-importer");
    const { owner, repo, branch } = parseGithubUrl(rawUrl);

    // Check if user has linked GitHub account for authenticated API calls
    const githubAccount = await db.account.findFirst({
      where: {
        userId: user.id,
        provider: "github",
      },
    });

    const token = githubAccount?.access_token || undefined;
    const metadata = await fetchGithubMetadata(owner, repo, token);

    return {
      success: true,
      metadata: {
        ...metadata,
        requestedBranch: branch || metadata.defaultBranch,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to retrieve repository details.";
    return { success: false, error: errorMessage };
  }
};

/**
 * Downloads a GitHub repository, parses its files into a TemplateFolder,
 * and saves it as a new Playground with TemplateFile in MongoDB.
 */
export const importGithubRepo = async (data: {
  url: string;
  branch?: string;
  customTitle?: string;
}) => {
  const user = await currentUser();
  if (!user?.id) {
    throw new Error("Unauthorized. Please sign in to import a repository.");
  }

  try {
    const { parseGithubUrl, fetchGithubMetadata, downloadAndExtractGithubRepo } = await import(
      "./github-importer"
    );

    const { owner, repo, branch: urlBranch } = parseGithubUrl(data.url);

    // Look for user's linked GitHub account access token
    const githubAccount = await db.account.findFirst({
      where: {
        userId: user.id,
        provider: "github",
      },
    });

    const token = githubAccount?.access_token || undefined;

    // Retrieve metadata for title, description, and default branch
    const metadata = await fetchGithubMetadata(owner, repo, token);
    const targetBranch = data.branch?.trim() || urlBranch || metadata.defaultBranch;

    // Download archive, extract, and convert to TemplateFolder
    const { templateData, detectedTemplate, fileCount, totalSizeBytes } =
      await downloadAndExtractGithubRepo(owner, repo, targetBranch, token);

    const rawTitle = data.customTitle?.trim() || metadata.name || repo;
    const title = rawTitle.slice(0, 100);
    const description = (
      metadata.description || `Imported from https://github.com/${owner}/${repo} (branch: ${targetBranch})`
    ).slice(0, 500);

    // Persist new Playground
    const playground = await db.playground.create({
      data: {
        title,
        description,
        template: detectedTemplate,
        userId: user.id,
      },
    });

    // Persist extracted file tree
    await db.templateFile.create({
      data: {
        playgroundId: playground.id,
        content: JSON.stringify(templateData),
      },
    });

    logSecurityEvent("PROJECT_MODIFIED", {
      userId: user.id,
      targetId: playground.id,
      endpoint: "importGithubRepo",
      reason: `Imported repository ${owner}/${repo}@${targetBranch} (${fileCount} files, ${totalSizeBytes} bytes)`,
    });

    revalidatePath("/dashboard");
    return {
      success: true,
      playgroundId: playground.id,
      fileCount,
      template: detectedTemplate,
    };
  } catch (error) {
    console.error("Error importing GitHub repository:", error);
    const message = error instanceof Error ? error.message : "Failed to import GitHub repository.";
    throw new Error(message);
  }
};