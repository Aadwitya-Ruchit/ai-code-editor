import { auth } from "@/auth";
import { scanTemplateDirectory } from "@/modules/playground/lib/path-to-json";
import { db } from "@/lib/db";
import { templatePaths } from "@/lib/template";
import path from "path";
import { NextRequest } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json(
        { error: "Unauthorized. Please sign in to access playground templates." },
        { status: 401 }
      );
    }

    const { id } = await params;
    if (!id || typeof id !== "string") {
      return Response.json({ error: "Missing or invalid playground ID" }, { status: 400 });
    }

    // Verify playground existence and ownership
    const playground = await db.playground.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!playground) {
      return Response.json(
        { error: "Playground not found or access denied" },
        { status: 404 }
      );
    }

    const templateKey = playground.template as keyof typeof templatePaths;
    const templatePath = templatePaths[templateKey];

    if (!templatePath) {
      return Response.json({ error: "Invalid template configured" }, { status: 400 });
    }

    const inputPath = path.join(/*turbopackIgnore: true*/ process.cwd(), templatePath);

    // Scan directory directly in-memory (concurrency safe, no race condition on temporary files)
    const result = await scanTemplateDirectory(inputPath);

    return Response.json({ success: true, templateJson: result }, { status: 200 });
  } catch (error) {
    console.error("Error generating template structure:", error);
    return Response.json({ error: "Failed to generate template structure" }, { status: 500 });
  }
}
