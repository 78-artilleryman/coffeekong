import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { retranscribeWithDiarization } from "@/lib/assemblyai/transcription";
import { promises as fs } from "fs";
import path from "path";

// POST: 기존 전사본에 화자 분리 추가 (AssemblyAI 사용)
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

    // 전사본 조회 (source 포함)
    const transcript = await prisma.transcripts.findUnique({
      where: { id: transcriptId },
      include: {
        sources: true,
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

    console.log(`🎤 AssemblyAI로 전사본 #${id}의 화자 분리 시작...`);

    // 오디오 파일 가져오기
    let audioBuffer: Buffer;

    if (audioFile) {
      // FormData로 받은 파일 사용
      const arrayBuffer = await audioFile.arrayBuffer();
      audioBuffer = Buffer.from(arrayBuffer);
      console.log(`📁 업로드된 오디오 파일 사용: ${audioFile.name}`);
    } else {
      // source에서 오디오 파일 가져오기 시도
      const source = transcript.sources;
      if (source.storage_path) {
        try {
          // 로컬 파일 시스템에서 읽기 시도
          // 주의: 실제 프로덕션에서는 S3나 다른 저장소를 사용할 수 있음
          const filePath = path.join(
            process.cwd(),
            "public",
            source.storage_path
          );
          audioBuffer = await fs.readFile(filePath);
          console.log(`📁 저장소에서 오디오 파일 읽기: ${source.storage_path}`);
        } catch (fileError) {
          console.error("오디오 파일 읽기 실패:", fileError);
          return NextResponse.json(
            {
              error:
                "저장된 오디오 파일을 찾을 수 없습니다. 화자 분리를 위해서는 원본 오디오 파일을 다시 업로드해주세요.",
            },
            { status: 400 }
          );
        }
      } else {
        return NextResponse.json(
          {
            error:
              "화자 분리를 위해서는 원본 오디오 파일이 필요합니다. 오디오 파일을 업로드해주세요.",
          },
          { status: 400 }
        );
      }
    }

    // AssemblyAI로 재전사 (화자 분리 포함)
    const result = await retranscribeWithDiarization(audioBuffer, speakerCount);

    if (!result.utterances || result.utterances.length === 0) {
      return NextResponse.json(
        { error: "화자 분리 결과를 가져올 수 없습니다" },
        { status: 500 }
      );
    }

    // 기존 세그먼트 삭제
    await prisma.transcript_segments.deleteMany({
      where: { transcript_id: transcriptId },
    });

    // 새 세그먼트 생성 (화자 정보 포함)
    await prisma.transcript_segments.createMany({
      data: result.utterances.map((utterance, idx: number) => ({
        transcript_id: transcriptId,
        idx: idx,
        start_ms: utterance.start,
        end_ms: utterance.end,
        text: utterance.text,
        speaker_label: utterance.speaker,
      })),
    });

    // 화자 정보 추출
    const speakers = Array.from(
      new Set(result.utterances.map((u) => u.speaker))
    );

    // 전사본의 diarization 정보 업데이트
    await prisma.transcripts.update({
      where: { id: transcriptId },
      data: {
        diarization: {
          method: "assemblyai",
          speakers: speakers,
          utterances: result.utterances.length,
        },
      },
    });

    console.log(`✅ AssemblyAI 화자 분리 완료: ${speakers.length}명 감지`);

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
