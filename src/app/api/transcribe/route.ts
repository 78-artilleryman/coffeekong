import { NextRequest, NextResponse } from "next/server";
import { transcribeWithAssemblyAI } from "@/lib/assemblyai/transcription";

export const runtime = "nodejs";
export const maxDuration = 300; // 5분 타임아웃

// POST: 음성 파일 업로드 및 전사
export async function POST(request: NextRequest) {
  try {
    // FormData에서 파일 추출
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const userId = formData.get("userId") as string | null;
    const tags = formData.get("tags") as string | null;
    const enableDiarization = formData.get("enableDiarization") === "true"; // GPT 화자 분리
    const speakerCount = parseInt(
      (formData.get("speakerCount") as string) || "2"
    );

    if (!file) {
      return NextResponse.json({ error: "파일이 필요합니다" }, { status: 400 });
    }

    // 파일 형식 검증 (MIME 타입 + 확장자)
    const allowedTypes = [
      "audio/mpeg",
      "audio/mp3",
      "audio/wav",
      "audio/x-wav",
      "audio/m4a",
      "audio/mp4",
      "audio/x-m4a",
      "audio/webm",
      "audio/ogg",
      "audio/vorbis",
    ];

    const allowedExtensions = [
      ".mp3",
      ".MP3",
      ".wav",
      ".WAV",
      ".m4a",
      ".M4A",
      ".mp4",
      ".MP4",
      ".webm",
      ".WEBM",
      ".ogg",
      ".OGG",
    ];

    // 확장자 확인
    const fileExtension = file.name.substring(file.name.lastIndexOf("."));
    const hasValidExtension = allowedExtensions.includes(fileExtension);
    const hasValidMimeType = allowedTypes.includes(file.type);

    if (!hasValidExtension && !hasValidMimeType) {
      return NextResponse.json(
        {
          error: `지원하지 않는 파일 형식입니다. 파일: ${file.name} (${file.type})`,
        },
        { status: 400 }
      );
    }

    // 파일 크기 검증 (25MB 제한 - Whisper API 제한)
    const maxSize = 25 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "파일 크기는 25MB 이하여야 합니다" },
        { status: 400 }
      );
    }

    console.log(`📁 파일 수신: ${file.name} (${file.size} bytes)`);

    // File을 Buffer로 변환
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 태그 파싱
    const parsedTags = tags ? tags.split(",").map((t) => t.trim()) : [];

    // AssemblyAI 전사 (화자 분리 통합)
    console.log(
      `🚀 AssemblyAI 전사 시작 (화자 분리: ${enableDiarization}, 화자 수: ${speakerCount})...`
    );
    const result = await transcribeWithAssemblyAI({
      audioFile: buffer,
      fileName: file.name,
      mimeType: file.type,
      userId: userId || undefined,
      tags: parsedTags,
      speakerCount: enableDiarization ? speakerCount : undefined,
    });

    console.log(`✅ 전사 완료!`);

    return NextResponse.json({
      success: true,
      data: {
        sourceId: result.sourceId.toString(),
        transcriptId: result.transcriptId.toString(),
        text: result.text,
        language: result.language,
        segmentCount: result.segments.length,
        wordCount: result.text.split(/\s+/).length,
        speakerCount: result.speakerCount,
      },
    });
  } catch (error) {
    console.error("전사 API 오류:", error);
    return NextResponse.json(
      {
        error: "전사 처리 중 오류가 발생했습니다",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
