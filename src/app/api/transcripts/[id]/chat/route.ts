import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ChatOpenAI } from "@langchain/openai";

const chatModel = new ChatOpenAI({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: "gpt-4o-mini",
  temperature: 0.7,
});

// POST: 전사본 기반 RAG 질의응답
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const transcriptId = BigInt(id);
    const { message, history } = await request.json();

    if (!message) {
      return NextResponse.json(
        { error: "메시지가 필요합니다" },
        { status: 400 }
      );
    }

    // 1. 전사본 조회
    const transcript = await prisma.transcripts.findUnique({
      where: { id: transcriptId },
      include: {
        sources: {
          select: {
            title: true,
          },
        },
      },
    });

    if (!transcript) {
      return NextResponse.json(
        { error: "전사본을 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    // 2. 청크 조회 (간단한 키워드 검색 - 전체 텍스트 사용)
    const fullText = transcript.text_full;
    const title = transcript.sources?.title || "전사본";

    // 3. 대화 이력 구성
    const conversationHistory = (history || [])
      .slice(-5) // 최근 5개만
      .map(
        (msg: { role: string; content: string }) =>
          `${msg.role === "user" ? "사용자" : "AI"}: ${msg.content}`
      )
      .join("\n");

    // 4. AI 프롬프트 구성
    const systemPrompt = `당신은 음성 전사본 내용을 분석하고 질문에 답하는 AI 어시스턴트입니다.

전사본 제목: ${title}
전사본 내용:
"""
${fullText}
"""

위 전사본의 내용을 바탕으로 사용자의 질문에 정확하고 상세하게 답변해주세요.
- 전사본에 없는 내용은 추측하지 말고 "전사본에 해당 정보가 없습니다"라고 답변하세요.
- 답변할 때는 전사본의 어느 부분에서 찾았는지 간단히 언급하면 좋습니다.
- 한국어로 답변하세요.`;

    const userPrompt = conversationHistory
      ? `이전 대화:
${conversationHistory}

사용자 질문: ${message}`
      : `사용자 질문: ${message}`;

    // 5. AI 호출
    console.log(`💬 RAG 질의: ${message.substring(0, 50)}...`);

    const response = await chatModel.invoke([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    const answer = response.content as string;
    console.log(`✅ RAG 응답: ${answer.substring(0, 50)}...`);

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
