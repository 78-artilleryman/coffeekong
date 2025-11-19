import { NextRequest, NextResponse } from "next/server";
import { simpleChat, ragChat } from "@/lib/langchain/chat";

// POST: 간단한 채팅
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, context } = body;

    if (!message) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    let response: string;

    if (context) {
      // RAG 모드
      response = await ragChat(message, context);
    } else {
      // 일반 채팅 모드
      response = await simpleChat(message);
    }

    return NextResponse.json({ response });
  } catch (error) {
    console.error("Error in chat:", error);
    return NextResponse.json(
      { error: "Failed to process chat" },
      { status: 500 }
    );
  }
}
