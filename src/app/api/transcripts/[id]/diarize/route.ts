import { NextRequest, NextResponse } from "next/server";
import { runDiarizationWorkflow } from "@/lib/langchain/diarization-workflow";

// POST: 기존 전사본에 화자 분리 추가 (LangChain 체인 사용)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const formData = await request.formData();
    const speakerCount = parseInt(
      (formData.get("speakerCount") as string) || "2"
    );
    const audioFile = formData.get("file") as File | null;

    if (!speakerCount || speakerCount < 1 || speakerCount > 10) {
      return NextResponse.json(
        { error: "화자 수는 1~10명 사이여야 합니다" },
        { status: 400 }
      );
    }

    const transcriptId = BigInt(id);

    // LangChain 체인으로 화자 분리 워크플로우 실행
    const result = await runDiarizationWorkflow(
      transcriptId,
      speakerCount,
      audioFile
    );

    return NextResponse.json(result);
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
