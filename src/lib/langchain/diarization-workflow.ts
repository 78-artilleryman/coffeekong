// LangGraph를 사용한 화자 분리 워크플로우
import { StateGraph, Annotation } from "@langchain/langgraph";
import { prisma } from "@/lib/prisma";
import { promises as fs } from "fs";
import path from "path";

const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;
const ASSEMBLYAI_API_URL = "https://api.assemblyai.com/v2";

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

// LangGraph 상태 정의 (Annotation 사용)
const DiarizationState = Annotation.Root({
  transcriptId: Annotation<bigint>(),
  speakerCount: Annotation<number>(),
  audioFile: Annotation<File | null | undefined>(),
  transcript: Annotation<
    | {
        sources: {
          storage_path: string | null;
        };
        transcript_segments: Array<{
          speaker_label: string | null;
        }>;
      }
    | undefined
  >(),
  audioBuffer: Annotation<Buffer | undefined>(),
  audioUrl: Annotation<string | undefined>(),
  transcriptRequestId: Annotation<string | undefined>(),
  transcriptResult: Annotation<AssemblyAIResponse | undefined>(),
  speakers: Annotation<string[] | undefined>(),
  error: Annotation<string | undefined>(),
});

type DiarizationWorkflowState = typeof DiarizationState.State;

// 1. 전사본 조회 및 검증 단계
async function retrieveTranscriptStep(
  state: DiarizationWorkflowState
): Promise<Partial<DiarizationWorkflowState>> {
  console.log(`📖 전사본 조회: ${state.transcriptId}`);

  const transcript = await prisma.transcripts.findUnique({
    where: { id: state.transcriptId },
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
    throw new Error("전사본을 찾을 수 없습니다");
  }

  // 이미 화자 정보가 있는지 확인
  const hasExistingSpeakers = transcript.transcript_segments.some(
    (seg) => seg.speaker_label !== null
  );

  if (hasExistingSpeakers) {
    throw new Error("이미 화자 정보가 있습니다");
  }

  console.log(`✅ 전사본 조회 완료`);
  return { transcript };
}

// 2. 오디오 파일 가져오기 단계
async function getAudioFileStep(
  state: DiarizationWorkflowState
): Promise<Partial<DiarizationWorkflowState>> {
  console.log(`📁 오디오 파일 가져오기...`);

  let audioBuffer: Buffer;

  if (state.audioFile) {
    // FormData로 받은 파일 사용
    const arrayBuffer = await state.audioFile.arrayBuffer();
    audioBuffer = Buffer.from(arrayBuffer);
    console.log(`📁 업로드된 오디오 파일 사용: ${state.audioFile.name}`);
  } else {
    // source에서 오디오 파일 가져오기 시도
    const source = state.transcript?.sources;
    if (source?.storage_path) {
      try {
        const filePath = path.join(
          process.cwd(),
          "public",
          source.storage_path
        );
        audioBuffer = await fs.readFile(filePath);
        console.log(`📁 저장소에서 오디오 파일 읽기: ${source.storage_path}`);
      } catch (fileError) {
        console.error("오디오 파일 읽기 실패:", fileError);
        throw new Error(
          "저장된 오디오 파일을 찾을 수 없습니다. 화자 분리를 위해서는 원본 오디오 파일을 다시 업로드해주세요."
        );
      }
    } else {
      throw new Error(
        "화자 분리를 위해서는 원본 오디오 파일이 필요합니다. 오디오 파일을 업로드해주세요."
      );
    }
  }

  return { audioBuffer };
}

// 3. AssemblyAI에 파일 업로드 단계
async function uploadAudioStep(
  state: DiarizationWorkflowState
): Promise<Partial<DiarizationWorkflowState>> {
  console.log(`📤 AssemblyAI에 파일 업로드 중...`);

  if (!state.audioBuffer) {
    throw new Error("오디오 버퍼가 없습니다");
  }

  const uint8Array = new Uint8Array(state.audioBuffer);

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
  return { audioUrl: data.upload_url };
}

// 4. 화자 분리 활성화한 전사 요청 단계
async function createTranscriptStep(
  state: DiarizationWorkflowState
): Promise<Partial<DiarizationWorkflowState>> {
  console.log(`🎤 화자 분리 전사 요청 중... (화자 수: ${state.speakerCount})`);

  const response = await fetch(`${ASSEMBLYAI_API_URL}/transcript`, {
    method: "POST",
    headers: {
      authorization: ASSEMBLYAI_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      audio_url: state.audioUrl,
      speaker_labels: true,
      speakers_expected: state.speakerCount,
      language_code: "ko",
    }),
  });

  if (!response.ok) {
    throw new Error(`전사 요청 실패: ${response.statusText}`);
  }

  const data = await response.json();
  console.log(`✅ 전사 요청 완료: ${data.id}`);
  return { transcriptRequestId: data.id };
}

// 5. 전사 결과 폴링 단계
async function pollTranscriptStep(
  state: DiarizationWorkflowState
): Promise<Partial<DiarizationWorkflowState>> {
  console.log(`⏳ 전사 결과 대기 중...`);

  while (true) {
    const response = await fetch(
      `${ASSEMBLYAI_API_URL}/transcript/${state.transcriptRequestId}`,
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

      if (!data.utterances || data.utterances.length === 0) {
        throw new Error("화자 분리 결과를 가져올 수 없습니다");
      }

      const speakers = Array.from(
        new Set(data.utterances.map((u) => u.speaker))
      );

      return {
        transcriptResult: data,
        speakers,
      };
    } else if (data.status === "error") {
      throw new Error(`전사 실패: ${data.error}`);
    }

    // 2초마다 확인
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

// 6. DB 업데이트 단계
async function updateDatabaseStep(
  state: DiarizationWorkflowState
): Promise<Partial<DiarizationWorkflowState>> {
  console.log(`💾 데이터베이스 업데이트 중...`);

  if (!state.transcriptResult || !state.transcriptResult.utterances) {
    throw new Error("전사 결과가 없습니다");
  }

  // 기존 세그먼트 삭제
  await prisma.transcript_segments.deleteMany({
    where: { transcript_id: state.transcriptId },
  });

  // 새 세그먼트 생성 (화자 정보 포함)
  await prisma.transcript_segments.createMany({
    data: state.transcriptResult.utterances.map(
      (utterance: AssemblyAIUtterance, idx: number) => ({
        transcript_id: state.transcriptId,
        idx: idx,
        start_ms: utterance.start,
        end_ms: utterance.end,
        text: utterance.text,
        speaker_label: utterance.speaker,
      })
    ),
  });

  // 전사본의 diarization 정보 업데이트
  await prisma.transcripts.update({
    where: { id: state.transcriptId },
    data: {
      diarization: {
        method: "assemblyai",
        speakers: state.speakers || [],
        utterances: state.transcriptResult.utterances.length,
      },
    },
  });

  console.log(
    `✅ AssemblyAI 화자 분리 완료: ${state.speakers?.length || 0}명 감지`
  );

  return {};
}

// LangGraph 워크플로우 생성
function createDiarizationGraph() {
  const workflow = new StateGraph(DiarizationState);

  // 노드 추가
  workflow.addNode("retrieveTranscript", retrieveTranscriptStep);
  workflow.addNode("getAudioFile", getAudioFileStep);
  workflow.addNode("uploadAudio", uploadAudioStep);
  workflow.addNode("createTranscript", createTranscriptStep);
  workflow.addNode("pollTranscript", pollTranscriptStep);
  workflow.addNode("updateDatabase", updateDatabaseStep);

  // 엣지 추가 - 순차 실행
  // @ts-expect-error - LangGraph 타입 시스템의 복잡성으로 인한 타입 오류
  workflow.addEdge("__start__", "retrieveTranscript");
  // @ts-expect-error - LangGraph 타입 시스템의 복잡성으로 인한 타입 오류
  workflow.addEdge("retrieveTranscript", "getAudioFile");
  // @ts-expect-error - LangGraph 타입 시스템의 복잡성으로 인한 타입 오류
  workflow.addEdge("getAudioFile", "uploadAudio");
  // @ts-expect-error - LangGraph 타입 시스템의 복잡성으로 인한 타입 오류
  workflow.addEdge("uploadAudio", "createTranscript");
  // @ts-expect-error - LangGraph 타입 시스템의 복잡성으로 인한 타입 오류
  workflow.addEdge("createTranscript", "pollTranscript");
  // @ts-expect-error - LangGraph 타입 시스템의 복잡성으로 인한 타입 오류
  workflow.addEdge("pollTranscript", "updateDatabase");
  // @ts-expect-error - LangGraph 타입 시스템의 복잡성으로 인한 타입 오류
  workflow.addEdge("updateDatabase", "__end__");

  return workflow.compile();
}

// LangGraph를 사용한 화자 분리 워크플로우
export async function runDiarizationWorkflow(
  transcriptId: bigint,
  speakerCount: number,
  audioFile?: File | null
) {
  console.log(`🚀 LangGraph로 화자 분리 워크플로우 시작...`);

  const graph = createDiarizationGraph();

  const initialState: Partial<DiarizationWorkflowState> = {
    transcriptId,
    speakerCount,
    audioFile,
  };

  try {
    const result = await graph.invoke(initialState);
    console.log(`✅ 화자 분리 워크플로우 완료!`);

    return {
      success: true,
      speakerCount: result.speakers?.length || 0,
      speakers: result.speakers || [],
      message: `${result.speakers?.length || 0}명의 화자가 감지되었습니다`,
    };
  } catch (error) {
    console.error("화자 분리 워크플로우 오류:", error);
    throw error;
  }
}
