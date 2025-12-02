import { NextRequest, NextResponse } from "next/server";
import { runRAG } from "@/lib/langchain/rag-chain";

// POST: 전사본 기반 RAG 질의응답 (LangGraph 사용)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const transcriptId = BigInt(id);
    const { message, history, useWebSearch } = await request.json();

    if (!message) {
      return NextResponse.json(
        { error: "메시지가 필요합니다" },
        { status: 400 }
      );
    }

    // LangChain RAG 체인 실행
    const answer = await runRAG(
      transcriptId,
      message,
      history || [],
      useWebSearch || false
    );

    return NextResponse.json({
      answer,
      success: true,
    });
  } catch (error) {
    console.error("RAG 질의응답 오류:", error);
    return NextResponse.json(
      {
        error: "AI 응답 생성 중 오류가 발생했습니다",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
