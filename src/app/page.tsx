"use client";

import { useState, useEffect } from "react";

interface TranscriptResult {
  sourceId: string;
  transcriptId: string;
  text: string;
  language: string;
  segmentCount: number;
  wordCount: number;
}

interface TranscriptHistory {
  id: string;
  sourceId: string;
  model: string;
  language: string | null;
  textPreview: string;
  textLength: number;
  wordCount: number | null;
  createdAt: string | null;
  source: {
    id: string;
    title: string | null;
    source_type: string;
    tags: string[];
  };
  segmentCount: number;
  chunkCount: number;
}

interface TranscriptSegment {
  id: string;
  idx: number;
  startMs: number;
  endMs: number;
  text: string;
  speakerLabel: string | null;
}

interface TranscriptDetail {
  id: string;
  text: string;
  language: string | null;
  wordCount: number | null;
  createdAt: string | null;
  source: {
    title: string | null;
  };
  segments: TranscriptSegment[];
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<"upload" | "history">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [tags, setTags] = useState("");
  const [enableDiarization, setEnableDiarization] = useState(false); // 🎯 화자 분리
  const [speakerCount, setSpeakerCount] = useState(2); // 화자 수
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("");
  const [result, setResult] = useState<TranscriptResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 전사본 목록
  const [transcripts, setTranscripts] = useState<TranscriptHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedTranscript, setSelectedTranscript] =
    useState<TranscriptDetail | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // 파일 확장자 확인
      const fileName = selectedFile.name.toLowerCase();
      const validExtensions = [".mp3", ".wav", ".m4a", ".mp4", ".webm", ".ogg"];
      const hasValidExtension = validExtensions.some((ext) =>
        fileName.endsWith(ext)
      );

      if (!hasValidExtension) {
        setError(
          "지원하지 않는 파일 형식입니다. mp3, wav, m4a, webm, ogg 파일만 가능합니다."
        );
        setFile(null);
        e.target.value = "";
        return;
      }

      // 파일 크기 확인 (25MB)
      const maxSize = 25 * 1024 * 1024;
      if (selectedFile.size > maxSize) {
        setError("파일 크기는 25MB 이하여야 합니다.");
        setFile(null);
        e.target.value = "";
        return;
      }

      setFile(selectedFile);
      setResult(null);
      setError(null);
    }
  };

  // 전사본 목록 불러오기
  const fetchTranscripts = async () => {
    setLoadingHistory(true);
    try {
      const response = await fetch("/api/transcripts?limit=20");
      const data = await response.json();
      setTranscripts(data.transcripts || []);
    } catch (err) {
      console.error("전사본 목록 조회 실패:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // 히스토리 탭 진입 시 목록 불러오기
  useEffect(() => {
    if (activeTab === "history") {
      fetchTranscripts();
    }
  }, [activeTab]);

  const handleDeleteTranscript = async (transcriptId: string) => {
    if (
      !confirm("이 전사본을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")
    ) {
      return;
    }

    setDeletingId(transcriptId);

    try {
      const response = await fetch(`/api/transcripts/${transcriptId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "삭제 실패");
      }

      // 목록에서 제거
      setTranscripts((prev) => prev.filter((t) => t.id !== transcriptId));
      console.log("🗑️ 전사본 삭제 완료");
    } catch (err) {
      alert(err instanceof Error ? err.message : "삭제 중 오류가 발생했습니다");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file) {
      setError("파일을 선택해주세요");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      setLoadingStatus("📤 파일 업로드 중...");
      const formData = new FormData();
      formData.append("file", file);
      if (tags) {
        formData.append("tags", tags);
      }
      formData.append("enableDiarization", enableDiarization.toString());
      if (enableDiarization) {
        formData.append("speakerCount", speakerCount.toString());
      }

      // 예상 시간 계산 (1분당 약 10초)
      const durationMinutes = file.size / (1024 * 1024) / 0.5; // 대략적 추정
      const estimatedSeconds = Math.ceil(durationMinutes * 10);

      setLoadingStatus(
        `🎤 AssemblyAI로 전사 중... (예상 시간: 약 ${Math.ceil(
          estimatedSeconds / 3
        )}초)`
      );

      const startTime = Date.now();
      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "전사 처리에 실패했습니다");
      }

      const elapsedTime = Math.ceil((Date.now() - startTime) / 1000);
      setLoadingStatus(`✅ 완료! (소요 시간: ${elapsedTime}초)`);

      setTimeout(() => {
        setResult(data.data);
        setLoadingStatus("");
      }, 500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다"
      );
      setLoadingStatus("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-zinc-50 to-zinc-100 dark:from-zinc-900 dark:to-black">
      <main className="container mx-auto px-4 py-16">
        {/* 헤더 */}
        <div className="mb-12 text-center">
          <h1 className="mb-4 text-5xl font-bold text-zinc-900 dark:text-white">
            🎙️ CoffeeKong
          </h1>
          <p className="text-xl text-zinc-600 dark:text-zinc-400">
            음성 파일을 텍스트로 변환하는 AI 서비스
          </p>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-500">
            Powered by AssemblyAI - 빠르고 정확한 AI 전사
          </p>
        </div>

        {/* 탭 UI */}
        <div className="mx-auto mb-8 max-w-2xl">
          <div className="flex gap-2 rounded-lg bg-white p-1 shadow dark:bg-zinc-800">
            <button
              onClick={() => setActiveTab("upload")}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
                activeTab === "upload"
                  ? "bg-blue-600 text-white"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700"
              }`}
            >
              🎤 새 전사
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
                activeTab === "history"
                  ? "bg-blue-600 text-white"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700"
              }`}
            >
              📋 전사 기록
            </button>
          </div>
        </div>

        {/* 업로드 탭 */}
        {activeTab === "upload" && (
          <div className="mx-auto max-w-2xl">
            <div className="rounded-2xl bg-white p-8 shadow-xl dark:bg-zinc-800">
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* 파일 업로드 */}
                <div>
                  <label
                    htmlFor="file-upload"
                    className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    음성 파일 선택
                  </label>
                  <div className="relative">
                    <input
                      id="file-upload"
                      type="file"
                      accept=".mp3,.MP3,.wav,.WAV,.m4a,.M4A,.mp4,.MP4,.webm,.WEBM,.ogg,.OGG,audio/*"
                      onChange={handleFileChange}
                      className="w-full cursor-pointer rounded-lg border-2 border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600 transition hover:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
                    />
                  </div>
                  {file && (
                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                      선택된 파일: <strong>{file.name}</strong> (
                      {(file.size / 1024 / 1024).toFixed(2)} MB)
                    </p>
                  )}
                  <p className="mt-2 text-xs text-zinc-500">
                    지원 형식: mp3, wav, m4a, webm, ogg (대소문자 구분 없음,
                    최대 25MB)
                  </p>
                </div>

                {/* 태그 입력 */}
                <div>
                  <label
                    htmlFor="tags"
                    className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    태그 (선택사항)
                  </label>
                  <input
                    id="tags"
                    type="text"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="회의, 인터뷰, 강의 (쉼표로 구분)"
                    className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white"
                  />
                </div>

                {/* 화자 분리 옵션 */}
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={enableDiarization}
                      onChange={(e) => setEnableDiarization(e.target.checked)}
                      className="h-5 w-5 rounded border-zinc-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-zinc-900 dark:text-white">
                        🎭 화자 분리 (AssemblyAI)
                      </div>
                      <div className="text-xs text-zinc-600 dark:text-zinc-400">
                        고급 AI로 화자를 자동 구분합니다 (10분당 약 $0.15)
                      </div>
                    </div>
                  </label>

                  {/* 화자 수 입력 (화자 분리 활성화 시) */}
                  {enableDiarization && (
                    <div className="mt-3 flex items-center gap-3 border-t border-blue-200 pt-3 dark:border-blue-700">
                      <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                        예상 화자 수:
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={speakerCount}
                        onChange={(e) =>
                          setSpeakerCount(parseInt(e.target.value) || 2)
                        }
                        className="w-20 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-center text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white"
                      />
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">
                        명 (선택사항)
                      </span>
                    </div>
                  )}
                </div>

                {/* 제출 버튼 */}
                <button
                  type="submit"
                  disabled={!file || loading}
                  className="w-full rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:disabled:bg-zinc-700"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg
                        className="h-5 w-5 animate-spin"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      전사 중...
                    </span>
                  ) : (
                    "음성 파일 전사하기"
                  )}
                </button>
              </form>

              {/* 로딩 상태 메시지 */}
              {loadingStatus && (
                <div className="mt-6 rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
                  <p className="text-sm text-blue-600 dark:text-blue-400">
                    {loadingStatus}
                  </p>
                </div>
              )}

              {/* 에러 메시지 */}
              {error && (
                <div className="mt-6 rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
                  <p className="text-sm text-red-600 dark:text-red-400">
                    ❌ {error}
                  </p>
                </div>
              )}

              {/* 결과 표시 */}
              {result && (
                <div className="mt-6 space-y-4">
                  <div className="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
                    <p className="mb-2 font-semibold text-green-700 dark:text-green-400">
                      ✅ 전사 완료!
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-sm text-green-600 dark:text-green-500">
                      <div>언어: {result.language}</div>
                      <div>단어 수: {result.wordCount}개</div>
                      <div>세그먼트: {result.segmentCount}개</div>
                      <div>전사본 ID: {result.transcriptId}</div>
                    </div>
                  </div>

                  <div className="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-700">
                    <h3 className="mb-2 font-semibold text-zinc-900 dark:text-white">
                      전사 텍스트:
                    </h3>
                    <div className="max-h-96 overflow-y-auto rounded bg-white p-4 text-sm text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      {result.text}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <a
                      href={`/transcripts/${result.transcriptId}`}
                      className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-center text-sm font-medium text-white transition hover:bg-blue-700"
                    >
                      🎭 화자별 상세보기
                    </a>
                    <button
                      onClick={() => setActiveTab("history")}
                      className="flex-1 rounded-lg bg-zinc-600 px-4 py-2 text-center text-sm font-medium text-white transition hover:bg-zinc-700"
                    >
                      📋 전사본 목록
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 히스토리 탭 */}
        {activeTab === "history" && (
          <div className="mx-auto max-w-4xl">
            <div className="rounded-2xl bg-white p-8 shadow-xl dark:bg-zinc-800">
              <h2 className="mb-6 text-2xl font-bold text-zinc-900 dark:text-white">
                📋 전사 기록
              </h2>

              {loadingHistory ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
                    <p className="text-zinc-600 dark:text-zinc-400">
                      로딩 중...
                    </p>
                  </div>
                </div>
              ) : transcripts.length === 0 ? (
                <div className="py-12 text-center text-zinc-500 dark:text-zinc-400">
                  <p className="mb-2 text-4xl">📭</p>
                  <p>아직 전사 기록이 없습니다.</p>
                  <button
                    onClick={() => setActiveTab("upload")}
                    className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
                  >
                    첫 전사 시작하기
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {transcripts.map((transcript) => (
                    <div
                      key={transcript.id}
                      className="rounded-lg border border-zinc-200 p-4 transition hover:border-blue-500 hover:shadow-md dark:border-zinc-700 dark:hover:border-blue-500"
                    >
                      <div className="mb-2 flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-zinc-900 dark:text-white">
                            {transcript.source.title ||
                              `전사본 #${transcript.id}`}
                          </h3>
                          <div className="mt-1 flex flex-wrap gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                            <span>
                              🌐 {transcript.language || "알 수 없음"}
                            </span>
                            <span>📝 {transcript.wordCount || 0}단어</span>
                            <span>🔢 {transcript.segmentCount}세그먼트</span>
                            <span>
                              📅{" "}
                              {transcript.createdAt
                                ? new Date(
                                    transcript.createdAt
                                  ).toLocaleDateString("ko-KR")
                                : "날짜 없음"}
                            </span>
                          </div>
                          {transcript.source.tags &&
                            transcript.source.tags.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {transcript.source.tags.map((tag, idx) => (
                                  <span
                                    key={idx}
                                    className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() =>
                              handleDeleteTranscript(transcript.id)
                            }
                            disabled={deletingId === transcript.id}
                            className="rounded-lg bg-red-100 px-3 py-1 text-xs text-red-700 hover:bg-red-200 disabled:opacity-50 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40"
                            title="삭제"
                          >
                            {deletingId === transcript.id ? "..." : "🗑️"}
                          </button>
                          <a
                            href={`/transcripts/${transcript.id}`}
                            className="rounded-lg bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700"
                          >
                            상세보기
                          </a>
                        </div>
                      </div>
                      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                        {transcript.textPreview}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 상세 모달 */}
            {selectedTranscript && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                onClick={() => setSelectedTranscript(null)}
              >
                <div
                  className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-8 shadow-2xl dark:bg-zinc-800"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="mb-6 flex items-start justify-between">
                    <div>
                      <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">
                        {selectedTranscript.source.title ||
                          `전사본 #${selectedTranscript.id}`}
                      </h2>
                      <div className="mt-2 flex flex-wrap gap-3 text-sm text-zinc-600 dark:text-zinc-400">
                        <span>
                          언어: {selectedTranscript.language || "알 수 없음"}
                        </span>
                        <span>단어: {selectedTranscript.wordCount || 0}개</span>
                        <span>
                          생성:{" "}
                          {selectedTranscript.createdAt
                            ? new Date(
                                selectedTranscript.createdAt
                              ).toLocaleString("ko-KR")
                            : "날짜 없음"}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedTranscript(null)}
                      className="text-2xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                    >
                      ×
                    </button>
                  </div>

                  <div className="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900">
                    <h3 className="mb-2 font-semibold text-zinc-900 dark:text-white">
                      전사 텍스트:
                    </h3>
                    <div className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded bg-white p-4 text-sm text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      {selectedTranscript.text}
                    </div>
                  </div>

                  {selectedTranscript.segments &&
                    selectedTranscript.segments.length > 0 && (
                      <div className="mt-4 rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900">
                        <h3 className="mb-2 font-semibold text-zinc-900 dark:text-white">
                          세그먼트 ({selectedTranscript.segments.length}개):
                        </h3>
                        <div className="max-h-60 space-y-2 overflow-y-auto">
                          {selectedTranscript.segments.map(
                            (seg: TranscriptSegment, idx: number) => (
                              <div
                                key={idx}
                                className="rounded bg-white p-2 text-sm dark:bg-zinc-800"
                              >
                                <span className="font-mono text-xs text-zinc-500">
                                  [{Math.floor(seg.startMs / 1000)}s -{" "}
                                  {Math.floor(seg.endMs / 1000)}s]
                                </span>
                                <span className="ml-2 text-zinc-700 dark:text-zinc-300">
                                  {seg.text}
                                </span>
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 기능 설명 */}
        <div className="mx-auto mt-12 max-w-4xl">
          <h2 className="mb-6 text-center text-2xl font-bold text-zinc-900 dark:text-white">
            🚀 주요 기능
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="rounded-xl bg-white p-6 shadow-lg dark:bg-zinc-800">
              <div className="mb-3 text-3xl">🎤</div>
              <h3 className="mb-2 font-semibold text-zinc-900 dark:text-white">
                Whisper AI 전사
              </h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                OpenAI의 최신 Whisper 모델로 정확한 음성 인식
              </p>
            </div>
            <div className="rounded-xl bg-white p-6 shadow-lg dark:bg-zinc-800">
              <div className="mb-3 text-3xl">🔄</div>
              <h3 className="mb-2 font-semibold text-zinc-900 dark:text-white">
                LangGraph 워크플로우
              </h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                파일 저장 → 전사 → DB 저장 → 청크 생성 자동화
              </p>
            </div>
            <div className="rounded-xl bg-white p-6 shadow-lg dark:bg-zinc-800">
              <div className="mb-3 text-3xl">📦</div>
              <h3 className="mb-2 font-semibold text-zinc-900 dark:text-white">
                RAG 준비 완료
              </h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                벡터 임베딩과 청크로 나눠 검색 가능
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
