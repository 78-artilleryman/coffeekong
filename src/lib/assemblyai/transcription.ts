import { prisma } from "@/lib/prisma";
import crypto from "crypto";

const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;
const ASSEMBLYAI_API_URL = "https://api.assemblyai.com/v2";

interface TranscriptionOptions {
  audioFile: Buffer;
  fileName: string;
  mimeType: string;
  userId?: string;
  tags?: string[];
  speakerCount?: number; // 화자 수 (선택사항)
}

interface TranscriptionResult {
  sourceId: bigint;
  transcriptId: bigint;
  text: string;
  language: string;
  segments: Array<{
    id: number;
    start: number;
    end: number;
    text: string;
    speaker?: string;
  }>;
  speakerCount: number;
}

// 1. AssemblyAI에 오디오 파일 업로드
async function uploadAudioFile(audioBuffer: Buffer): Promise<string> {
  console.log(`📤 AssemblyAI에 파일 업로드 중...`);

  // Buffer를 Uint8Array로 변환
  const uint8Array = new Uint8Array(audioBuffer);

  const response = await fetch(`${ASSEMBLYAI_API_URL}/upload`, {
    method: "POST",
    headers: {
      authorization: ASSEMBLYAI_API_KEY!,
      "Content-Type": "application/octet-stream",
    },
    body: uint8Array,
  });

  if (!response.ok) {
    throw new Error(`파일 업로드 실패: ${response.statusText}`);
  }

  const data = await response.json();
  console.log(`✅ 파일 업로드 완료: ${data.upload_url}`);
  return data.upload_url;
}

// 2. 전사 요청
async function createTranscript(
  audioUrl: string,
  speakerCount?: number
): Promise<string> {
  console.log(
    `🎤 전사 요청 중... (화자 분리: ${speakerCount ? "활성화" : "비활성화"})`
  );

  const response = await fetch(`${ASSEMBLYAI_API_URL}/transcript`, {
    method: "POST",
    headers: {
      authorization: ASSEMBLYAI_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      audio_url: audioUrl,
      speaker_labels: speakerCount ? true : false, // 화자 분리 활성화
      speakers_expected: speakerCount, // 예상 화자 수
      language_code: "ko", // 한국어
    }),
  });

  if (!response.ok) {
    throw new Error(`전사 요청 실패: ${response.statusText}`);
  }

  const data = await response.json();
  console.log(`✅ 전사 요청 완료: ${data.id}`);
  return data.id;
}

// AssemblyAI 응답 타입
interface AssemblyAIUtterance {
  start: number;
  end: number;
  text: string;
  speaker: string;
}

interface AssemblyAIResponse {
  id: string;
  status: string;
  text: string;
  language_code: string;
  error?: string;
  utterances?: AssemblyAIUtterance[];
}

// 3. 전사 결과 폴링
async function pollTranscript(
  transcriptId: string
): Promise<AssemblyAIResponse> {
  console.log(`⏳ 전사 결과 대기 중...`);

  while (true) {
    const response = await fetch(
      `${ASSEMBLYAI_API_URL}/transcript/${transcriptId}`,
      {
        headers: {
          authorization: ASSEMBLYAI_API_KEY!,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`전사 결과 조회 실패: ${response.statusText}`);
    }

    const data = (await response.json()) as AssemblyAIResponse;

    if (data.status === "completed") {
      console.log(`✅ 전사 완료!`);
      return data;
    } else if (data.status === "error") {
      throw new Error(`전사 실패: ${data.error}`);
    }

    // 2초마다 확인
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

// 4. Source 생성 (중복 체크)
async function createSource(
  audioFile: Buffer,
  fileName: string,
  mimeType: string,
  userId?: string,
  tags?: string[]
): Promise<bigint> {
  const checksum = crypto.createHash("sha256").update(audioFile).digest("hex");

  const sizeBytes = BigInt(audioFile.length);
  const timestamp = Date.now();
  const storagePath = `audio/${timestamp}-${fileName}`;

  // 기존 파일 확인
  const existingSource = await prisma.sources.findUnique({
    where: { checksum_sha256: checksum },
  });

  if (existingSource) {
    console.log(`♻️ 기존 Source 재사용: ID ${existingSource.id}`);
    return existingSource.id;
  }

  // 새로 생성
  const source = await prisma.sources.create({
    data: {
      source_type: "audio",
      title: fileName,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      checksum_sha256: checksum,
      storage_path: storagePath,
      created_by: userId || null,
      tags: tags || [],
    },
  });

  console.log(`✅ Source 생성 완료: ID ${source.id}`);
  return source.id;
}

// 5. 전사본 및 세그먼트 저장
async function saveTranscript(
  sourceId: bigint,
  transcriptData: AssemblyAIResponse
): Promise<bigint> {
  console.log(`💾 전사본 저장 중...`);

  const text = transcriptData.text;
  const language = transcriptData.language_code || "ko";
  const wcCount = text.split(/\s+/).length;

  // 화자 정보
  const utterances = transcriptData.utterances || [];
  const speakers: string[] = utterances.length
    ? Array.from(new Set(utterances.map((u) => u.speaker)))
    : [];

  const diarization = speakers.length
    ? {
        method: "assemblyai",
        speakers: speakers,
        utterances: utterances.length,
      }
    : undefined;

  // 전사본 생성
  const transcript = await prisma.transcripts.create({
    data: {
      source_id: sourceId,
      model: "assemblyai-best",
      language: language,
      text_full: text,
      wc_count: wcCount,
      diarization: diarization,
    },
  });

  // 세그먼트 저장
  if (utterances.length > 0) {
    await prisma.transcript_segments.createMany({
      data: utterances.map((utterance, idx: number) => ({
        transcript_id: transcript.id,
        idx: idx,
        start_ms: utterance.start,
        end_ms: utterance.end,
        text: utterance.text,
        speaker_label: utterance.speaker,
      })),
    });
    console.log(
      `✅ ${utterances.length}개 세그먼트 저장 완료 (화자 정보 포함)`
    );
  }

  console.log(`✅ 전사본 저장 완료: ID ${transcript.id}`);
  return transcript.id;
}

// 6. 청크 생성
async function createChunks(
  sourceId: bigint,
  transcriptId: bigint,
  text: string,
  language: string
): Promise<void> {
  console.log(`📦 텍스트 청크 생성 중...`);

  const chunkSize = 1000;
  const chunks: string[] = [];

  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }

  await prisma.chunks.createMany({
    data: chunks.map((chunk, i) => ({
      source_id: sourceId,
      transcript_id: transcriptId,
      chunk_index: i,
      content: chunk,
      content_tokens: Math.ceil(chunk.length / 4),
      lang: language,
    })),
  });

  console.log(`✅ ${chunks.length}개 청크 생성 완료`);
}

// 메인 전사 함수
export async function transcribeWithAssemblyAI(
  options: TranscriptionOptions
): Promise<TranscriptionResult> {
  const { audioFile, fileName, mimeType, userId, tags, speakerCount } = options;

  try {
    // 1. Source 생성
    const sourceId = await createSource(
      audioFile,
      fileName,
      mimeType,
      userId,
      tags
    );

    // 2. AssemblyAI에 파일 업로드
    const audioUrl = await uploadAudioFile(audioFile);

    // 3. 전사 요청
    const transcriptId = await createTranscript(audioUrl, speakerCount);

    // 4. 결과 대기
    const result = await pollTranscript(transcriptId);

    // 5. DB에 저장
    const savedTranscriptId = await saveTranscript(sourceId, result);

    // 6. 청크 생성
    await createChunks(
      sourceId,
      savedTranscriptId,
      result.text,
      result.language_code || "ko"
    );

    // 7. 결과 반환
    const utterances = result.utterances || [];
    const segments = utterances.map((u, idx: number) => ({
      id: idx,
      start: u.start / 1000, // ms → s
      end: u.end / 1000,
      text: u.text,
      speaker: u.speaker,
    }));

    const speakers = utterances.length
      ? Array.from(new Set(utterances.map((u) => u.speaker)))
      : [];

    return {
      sourceId,
      transcriptId: savedTranscriptId,
      text: result.text,
      language: result.language_code || "ko",
      segments,
      speakerCount: speakers.length,
    };
  } catch (error) {
    console.error("AssemblyAI 전사 오류:", error);
    throw error;
  }
}

// 기존 전사본에 화자 분리를 추가하기 위한 재전사 함수
export async function retranscribeWithDiarization(
  audioFile: Buffer,
  speakerCount: number
): Promise<AssemblyAIResponse> {
  try {
    // 1. AssemblyAI에 파일 업로드
    const audioUrl = await uploadAudioFile(audioFile);

    // 2. 화자 분리 활성화한 전사 요청
    const transcriptId = await createTranscript(audioUrl, speakerCount);

    // 3. 결과 대기
    const result = await pollTranscript(transcriptId);

    return result;
  } catch (error) {
    console.error("AssemblyAI 재전사 오류:", error);
    throw error;
  }
}
