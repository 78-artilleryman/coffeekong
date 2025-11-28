import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET: 특정 전사본 상세 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const transcriptId = BigInt(id);

    const transcript = await prisma.transcripts.findUnique({
      where: { id: transcriptId },
      include: {
        sources: true,
        transcript_segments: {
          orderBy: {
            idx: "asc",
          },
        },
        chunks: {
          orderBy: {
            chunk_index: "asc",
          },
          select: {
            id: true,
            chunk_index: true,
            content: true,
            content_tokens: true,
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

    // BigInt를 문자열로 변환
    const serialized = {
      id: transcript.id.toString(),
      sourceId: transcript.source_id.toString(),
      model: transcript.model,
      language: transcript.language,
      text: transcript.text_full,
      wordCount: transcript.wc_count,
      confidence: transcript.confidence?.toString(),
      createdAt: transcript.created_at,
      source: {
        ...transcript.sources,
        id: transcript.sources.id.toString(),
        size_bytes: transcript.sources.size_bytes?.toString(),
      },
      segments: transcript.transcript_segments.map((seg) => ({
        id: seg.id.toString(),
        idx: seg.idx,
        startMs: seg.start_ms,
        endMs: seg.end_ms,
        text: seg.text,
        speakerLabel: seg.speaker_label,
      })),
      chunks: transcript.chunks.map((chunk) => ({
        id: chunk.id.toString(),
        index: chunk.chunk_index,
        content: chunk.content,
        tokens: chunk.content_tokens,
      })),
    };

    return NextResponse.json(serialized);
  } catch (error) {
    console.error("전사본 상세 조회 오류:", error);
    return NextResponse.json({ error: "전사본 조회 실패" }, { status: 500 });
  }
}

// DELETE: 전사본 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const transcriptId = BigInt(id);

    // 연관된 세그먼트와 청크는 cascade로 자동 삭제됨
    await prisma.transcripts.delete({
      where: { id: transcriptId },
    });

    return NextResponse.json({
      success: true,
      message: "전사본이 삭제되었습니다",
    });
  } catch (error) {
    console.error("전사본 삭제 오류:", error);
    return NextResponse.json({ error: "전사본 삭제 실패" }, { status: 500 });
  }
}
