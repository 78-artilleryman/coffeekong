import { NextRequest, NextResponse } from "next/server";
import { HumanMessage, BaseMessage } from "@langchain/core/messages";
import { createConversationGraph, createRAGGraph } from "@/lib/langchain/graph";

// GraphState 타입 정의 (graph.ts와 동일)
interface GraphState {
  messages: BaseMessage[];
  context?: string;
}

// POST: LangGraph 실행
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, type = "conversation" } = body;

    if (!message) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    let graph;
    if (type === "rag") {
      graph = createRAGGraph();
    } else {
      graph = createConversationGraph();
    }

    const result = (await graph.invoke({
      messages: [new HumanMessage(message)],
    })) as unknown as GraphState;

    return NextResponse.json({
      messages: result.messages.map((msg: BaseMessage) => ({
        type: msg._getType(),
        content: msg.content,
      })),
      context: result.context,
    });
  } catch (error) {
    console.error("Error in graph:", error);
    return NextResponse.json(
      { error: "Failed to process graph" },
      { status: 500 }
    );
  }
}
