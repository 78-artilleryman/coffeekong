import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ChatOpenAI } from "@langchain/openai";

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";

// OpenAI GPT 모델 (인터넷 검색 없을 때)
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
    const { message, history, useWebSearch } = await request.json();

    if (!message) {
      return NextResponse.json(
        { error: "메시지가 필요합니다" },
        { status: 400 }
      );
    }

    console.log(
      `💬 질문: ${message.substring(0, 50)}... (웹 검색: ${useWebSearch})`
    );

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

    // 2. 전사본 내용 준비
    const fullText = transcript.text_full;
    const title = transcript.sources?.title || "전사본";

    // 3. 대화 이력 구성
    const conversationHistory = (history || [])
      .slice(-5) // 최근 5개만
      .map((msg: { role: string; content: string }) => ({
        role: msg.role,
        content: msg.content,
      }));

    let answer: string;

    if (useWebSearch) {
      // 🌐 하이브리드 모드: Perplexity API (전사본 + 인터넷 검색)
      console.log(`🌐 Perplexity 하이브리드 모드...`);

      const systemMessage = `당신은 음성 전사본 분석과 인터넷 검색을 결합하는 AI 어시스턴트입니다.

전사본 제목: ${title}
전사본 내용:
"""
${fullText}
"""

사용자의 질문에 답할 때:
1. 먼저 전사본 내용을 확인하여 관련 정보를 찾으세요
2. 전사본에 부족한 부분이나 최신 정보가 필요하면 인터넷 검색을 활용하세요
3. 전사본 내용과 인터넷 정보를 구분하여 답변하세요 (예: "전사본에서는...", "최신 정보에 따르면...")
4. 한국어로 답변하세요`;

      const messages = [
        { role: "system", content: systemMessage },
        ...conversationHistory,
        { role: "user", content: message },
      ];

      const response = await fetch(PERPLEXITY_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
        },
        body: JSON.stringify({
          model: "sonar", // 최신 인터넷 검색 지원 모델
          messages: messages,
          temperature: 0.2,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Perplexity API 에러 상세:", errorData);
        throw new Error(
          `Perplexity API 오류: ${response.statusText} - ${JSON.stringify(
            errorData
          )}`
        );
      }

      const data = await response.json();
      answer = data.choices[0].message.content;
      console.log(
        `✅ Perplexity 응답 (웹 검색 포함): ${answer.substring(0, 50)}...`
      );
    } else {
      // 📄 전사본만 사용: OpenAI GPT (빠르고 저렴)
      console.log(`📄 GPT 전사본 전용 모드...`);

      const systemPrompt = `당신은 음성 전사본 내용을 분석하는 AI 어시스턴트입니다.

전사본 제목: ${title}
전사본 내용:
"""
${fullText}
"""

위 전사본의 내용을 바탕으로 사용자의 질문에 정확하고 상세하게 답변해주세요.
- 전사본에 없는 내용은 추측하지 말고 "전사본에 해당 정보가 없습니다"라고 답변하세요.
- 답변할 때는 전사본의 어느 부분에서 찾았는지 간단히 언급하면 좋습니다.
- 한국어로 답변하세요.`;

      const historyText = conversationHistory
        .map(
          (msg: { role: string; content: string }) =>
            `${msg.role === "user" ? "사용자" : "AI"}: ${msg.content}`
        )
        .join("\n");

      const userPrompt = historyText
        ? `이전 대화:
${historyText}

사용자 질문: ${message}`
        : `사용자 질문: ${message}`;

      const response = await chatModel.invoke([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ]);

      answer = response.content as string;
      console.log(`✅ GPT 응답 (전사본 전용): ${answer.substring(0, 50)}...`);
    }

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
