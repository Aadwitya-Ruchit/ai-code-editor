"use server";

import { db } from "@/lib/db";
import { TemplateFolder } from "../lib/path-to-json";
import { currentUser } from "@/modules/auth/actions";
import { logSecurityEvent } from "@/lib/security-logger";

export const getPlaygroundById = async (id: string) => {
  const user = await currentUser();
  if (!user?.id) {
    return null;
  }

  if (!id || typeof id !== "string") {
    return null;
  }

  try {
    const playground = await db.playground.findFirst({
      where: {
        id,
        userId: user.id,
      },
      select: {
        id: true,
        title: true,
        template: true,
        userId: true,
        templateFiles: {
          select: {
            content: true,
          },
        },
      },
    });

    if (!playground) {
      logSecurityEvent("UNAUTHORIZED_ACCESS_ATTEMPT", {
        userId: user.id,
        targetId: id,
        endpoint: "getPlaygroundById",
        reason: "Attempted to view playground not owned by user",
      });
    }

    return playground;
  } catch (error) {
    console.error("getPlaygroundById error:", error);
    return null;
  }
};

export const SaveUpdatedCode = async (
  playgroundId: string,
  data: TemplateFolder
) => {
  const user = await currentUser();
  if (!user?.id) {
    return null;
  }

  if (!playgroundId || typeof playgroundId !== "string") {
    return null;
  }

  // Verify that the target playground exists and belongs to the authenticated user
  const playground = await db.playground.findFirst({
    where: {
      id: playgroundId,
      userId: user.id,
    },
  });

  if (!playground) {
    logSecurityEvent("UNAUTHORIZED_ACCESS_ATTEMPT", {
      userId: user.id,
      targetId: playgroundId,
      endpoint: "SaveUpdatedCode",
      reason: "Attempted to overwrite template files of playground not owned by user",
    });
    return null;
  }

  try {
    const serializedContent = JSON.stringify(data);

    // Limit payload size to 10MB to prevent memory exhaustion
    if (serializedContent.length > 10 * 1024 * 1024) {
      console.error(
        `Payload too large in SaveUpdatedCode: ${serializedContent.length} bytes`
      );
      return null;
    }

    const updatedPlayground = await db.templateFile.upsert({
      where: {
        playgroundId,
      },
      update: {
        content: serializedContent,
      },
      create: {
        playgroundId,
        content: serializedContent,
      },
    });

    return updatedPlayground;
  } catch (error) {
    console.error("SaveUpdatedCode error:", error);
    return null;
  }
};