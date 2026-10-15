import { auth } from "@/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in to view conversations." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const rawTake = parseInt(searchParams.get("take") || "50", 10);
    const rawSkip = parseInt(searchParams.get("skip") || "0", 10);

    const take = Math.min(Math.max(1, isNaN(rawTake) ? 50 : rawTake), 100);
    const skip = Math.max(0, isNaN(rawSkip) ? 0 : rawSkip);

    const conversations = await db.conversation.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: "desc" },
      take,
      skip,
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { messages: true },
        },
      },
    });

    return NextResponse.json({ conversations });
  } catch (error) {
    console.error("Error fetching conversations:", error);
    return NextResponse.json(
      { error: "Failed to retrieve conversation history." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in to create a conversation." },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const rawTitle = typeof body.title === "string" ? body.title.trim() : "";
    const title = rawTitle.slice(0, 80) || "New Conversation";

    const conversation = await db.conversation.create({
      data: {
        userId: session.user.id,
        title,
      },
    });

    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error) {
    console.error("Error creating conversation:", error);
    return NextResponse.json(
      { error: "Failed to create conversation." },
      { status: 500 }
    );
  }
}
