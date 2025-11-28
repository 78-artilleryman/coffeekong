import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ChatOpenAI } from "@langchain/openai";

// ChatGPT 클라이언트 (화자 분리용)
const chatModel = new ChatOpenAI({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: "gpt-4o-mini",
  temperature: 0,
});

// POST: 기존 전사본에 화자 분리 추가
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { speakerCount } = body;

    if (!speakerCount || speakerCount < 1 || speakerCount > 10) {
      return NextResponse.json(
        { error: "화자 수는 1~10명 사이여야 합니다" },
        { status: 400 }
      );
    }

    const transcriptId = BigInt(id);

    // 전사본 조회
    const transcript = await prisma.transcripts.findUnique({
      where: { id: transcriptId },
      include: {
        transcript_segments: {
          orderBy: {
            idx: "asc",
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

    // 이미 화자 정보가 있는지 확인
    const hasExistingSpeakers = transcript.transcript_segments.some(
      (seg) => seg.speaker_label !== null
    );

    if (hasExistingSpeakers) {
      return NextResponse.json(
        { error: "이미 화자 정보가 있습니다" },
        { status: 400 }
      );
    }

    // 세그먼트가 없으면 오류
    if (transcript.transcript_segments.length === 0) {
      return NextResponse.json(
        { error: "세그먼트가 없어 화자 분리를 할 수 없습니다" },
        { status: 400 }
      );
    }

    console.log(`🤖 전사본 #${id}의 화자 분리 시작...`);

    // 세그먼트를 텍스트로 변환
    const segmentsText = transcript.transcript_segments
      .map((seg, idx) => `[${idx}] ${seg.text}`)
      .join("\n");

    // 화자 레이블 생성 (A, B, C...)
    const speakerLabels = Array.from(
      { length: speakerCount },
      (_, i) => String.fromCharCode(65 + i) // A=65
    );

    // GPT에게 화자 분리 요청
    const prompt = `다음은 음성 전사 결과입니다. 각 문장의 화자를 구분해주세요.

규칙:
1. 화자는 정확히 ${speakerCount}명이며, ${speakerLabels.join(
      ", "
    )} 중 하나로 표시해야 합니다
2. 대화 패턴, 질문-답변 구조, 말투, 주제 등으로 판단
3. 이름이 언급되면 그것도 고려
4. 연속된 문장이 같은 화자일 가능성이 높음
5. 각 화자가 최대한 균등하게 발화하도록 구분

전사 텍스트:
${segmentsText}

응답 형식 (JSON):
[
  {"index": 0, "speaker": "A"},
  {"index": 1, "speaker": "B"},
  ...
]

JSON만 반환하세요:`;

    const response = await chatModel.invoke(prompt);
    const content = response.content as string;

    // JSON 파싱
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error("GPT 응답에서 JSON을 찾을 수 없습니다");
    }

    const speakerAssignments = JSON.parse(jsonMatch[0]) as Array<{
      index: number;
      speaker: string;
    }>;

    // 세그먼트 업데이트
    for (const assignment of speakerAssignments) {
      const segment = transcript.transcript_segments[assignment.index];
      if (segment) {
        await prisma.transcript_segments.update({
          where: { id: segment.id },
          data: { speaker_label: assignment.speaker },
        });
      }
    }

    // 전사본의 diarization 정보 업데이트
    const speakers = Array.from(
      new Set(speakerAssignments.map((a) => a.speaker))
    );

    await prisma.transcripts.update({
      where: { id: transcriptId },
      data: {
        diarization: {
          method: "llm",
          speakers: speakers,
          utterances: speakerAssignments.length,
        },
        model: transcript.model + "-with-gpt-diarization",
      },
    });

    console.log(`✅ 화자 분리 완료: ${speakers.length}명 감지`);

    return NextResponse.json({
      success: true,
      speakerCount: speakers.length,
      speakers: speakers,
      message: `${speakers.length}명의 화자가 감지되었습니다`,
    });
  } catch (error) {
    console.error("화자 분리 오류:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "화자 분리 실패",
      },
      { status: 500 }
    );
  }
}
