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