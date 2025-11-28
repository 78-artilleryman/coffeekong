"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

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
    id: string;
    title: string | null;
    source_type: string;
    mime_type: string | null;
    tags: string[];
    created_at: string | null;
  };
  segments: TranscriptSegment[];
  chunks: Array<{
    id: string;
    index: number;
    content: string;
    tokens: number | null;
  }>;
}

export default function TranscriptDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [transcript, setTranscript] = useState<TranscriptDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [diarizationLoading, setDiarizationLoading] = useState(false);
  const [diarizationError, setDiarizationError] = useState<string | null>(null);
  const [speakerCount, setSpeakerCount] = useState(2);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const fetchTranscript = async () => {
    try {
      const response = await fetch(`/api/transcripts/${params.id}`);
      if (!response.ok) {
        throw new Error("전사본을 불러올 수 없습니다");
      }
      const data = await response.json();
      setTranscript(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (params.id) {
      fetchTranscript();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const handleDiarization = async () => {
    if (!params.id) return;

    if (speakerCount < 1 || speakerCount > 10) {
      setDiarizationError("화자 수는 1~10명 사이여야 합니다");
      return;
    }

    setDiarizationLoading(true);
    setDiarizationError(null);

    try {
      const response = await fetch(`/api/transcripts/${params.id}/diarize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ speakerCount }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "화자 분리 실패");
      }

      const result = await response.json();
      console.log("✅ 화자 분리 완료:", result);

      // 전사본 다시 불러오기
      await fetchTranscript();
    } catch (err) {
      setDiarizationError(
        err instanceof Error ? err.message : "화자 분리 중 오류가 발생했습니다"
      );
    } finally {
      setDiarizationLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!params.id) return;

    setDeleteLoading(true);

    try {
      const response = await fetch(`/api/transcripts/${params.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "삭제 실패");
      }

      console.log("🗑️ 전사본 삭제 완료");
      router.push("/"); // 홈으로 리다이렉트
    } catch (err) {
      alert(err instanceof Error ? err.message : "삭제 중 오류가 발생했습니다");
    } finally {
      setDeleteLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-900">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
          <p className="text-zinc-600 dark:text-zinc-400">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (error || !transcript) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-900">
        <div className="text-center">
          <p className="mb-4 text-4xl">😢</p>
          <p className="mb-4 text-zinc-600 dark:text-zinc-400">
            {error || "전사본을 찾을 수 없습니다"}
          </p>
          <Link
            href="/"
            className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            홈으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  // 화자 목록 추출
  const speakers = Array.from(
    new Set(
      transcript.segments.map((s) => s.speakerLabel).filter((s) => s !== null)
    )
  ).sort();

  // 연속된 같은 화자의 세그먼트를 하나로 합치기
  const mergedUtterances = transcript.segments.reduce((acc, segment) => {
    const lastUtterance = acc[acc.length - 1];

    if (lastUtterance && lastUtterance.speakerLabel === segment.speakerLabel) {
      // 같은 화자면 텍스트 합치기
      lastUtterance.text += " " + segment.text;
      lastUtterance.endMs = segment.endMs;
    } else {
      // 새로운 화자면 새로운 항목 추가
      acc.push({ ...segment });
    }

    return acc;
  }, [] as TranscriptSegment[]);

  // 화자별로 그룹화 (병합된 발화 사용)
  const segmentsBySpeaker = speakers.reduce((acc, speaker) => {
    acc[speaker as string] = mergedUtterances.filter(
      (s) => s.speakerLabel === speaker
    );
    return acc;
  }, {} as Record<string, TranscriptSegment[]>);

  // 화자별 색상
  const speakerColors: Record<string, string> = {
    A: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-700",
    B: "bg-green-100 text-green-800 border-green-300 dark:bg-green-900 dark:text-green-200 dark:border-green-700",
    C: "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900 dark:text-purple-200 dark:border-purple-700",
    D: "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900 dark:text-orange-200 dark:border-orange-700",
    E: "bg-pink-100 text-pink-800 border-pink-300 dark:bg-pink-900 dark:text-pink-200 dark:border-pink-700",
    F: "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900 dark:text-yellow-200 dark:border-yellow-700",
  };

  const getSpeakerColor = (speaker: string) => {
    return (
      speakerColors[speaker] ||
      "bg-zinc-100 text-zinc-800 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-600"
    );
  };

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      {/* 헤더 */}
      <div className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="container mx-auto px-4 py-6">
          <div className="mb-4 flex items-center justify-between">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              ← 뒤로가기
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={deleteLoading}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
              >
                🗑️ 삭제
              </button>
              <Link
                href="/"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
              >
                홈으로
              </Link>
            </div>
          </div>

          <h1 className="mb-2 text-3xl font-bold text-zinc-900 dark:text-white">
            {transcript.source.title || `전사본 #${transcript.id}`}
          </h1>

          <div className="flex flex-wrap gap-4 text-sm text-zinc-600 dark:text-zinc-400">
            <span>🌐 {transcript.language || "알 수 없음"}</span>
            <span>📝 {transcript.wordCount || 0}단어</span>
            <span>🔢 {transcript.segments.length}세그먼트</span>
            {speakers.length > 0 && <span>🎭 {speakers.length}명</span>}
            <span>
              📅{" "}
              {transcript.createdAt
                ? new Date(transcript.createdAt).toLocaleString("ko-KR")
                : "날짜 없음"}
            </span>
          </div>

          {transcript.source.tags && transcript.source.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {transcript.source.tags.map((tag, idx) => (
                <span
                  key={idx}
                  className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 컨텐츠 */}
      <div className="container mx-auto px-4 py-8">
        {/* 화자별 대화 뷰 (채팅 형식) */}
        {speakers.length > 0 ? (
          <div className="mx-auto max-w-4xl">
            <div className="rounded-lg bg-white p-6 shadow dark:bg-zinc-800">
              <div className="mb-4 flex items-center justify-between border-b border-zinc-200 pb-4 dark:border-zinc-700">
                <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
                  💬 대화 내역
                </h2>
                <span className="text-sm text-zinc-500">
                  {mergedUtterances.length}개 발화
                </span>
              </div>

              {/* 채팅 스타일 대화 */}
              <div className="max-h-[600px] space-y-4 overflow-y-auto">
                {mergedUtterances.map((segment, idx) => {
                  const speaker = segment.speakerLabel || "Unknown";
                  const isEven = speakers.indexOf(speaker) % 2 === 0;

                  return (
                    <div
                      key={`${segment.id}-${idx}`}
                      className={`flex ${
                        isEven ? "justify-start" : "justify-end"
                      }`}
                    >
                      <div
                        className={`max-w-[75%] ${isEven ? "" : "items-end"}`}
                      >
                        {/* 화자 이름 */}
                        <div
                          className={`mb-1 flex items-center gap-2 text-xs font-medium ${
                            isEven ? "" : "justify-end"
                          }`}
                        >
                          <span
                            className={`rounded-full px-2 py-0.5 ${getSpeakerColor(
                              speaker
                            )}`}
                          >
                            화자 {speaker}
                          </span>
                          <span className="text-zinc-400">
                            {formatTime(segment.startMs)}
                          </span>
                        </div>

                        {/* 말풍선 */}
                        <div
                          className={`rounded-2xl px-4 py-3 ${
                            isEven
                              ? "rounded-tl-none bg-zinc-100 dark:bg-zinc-700"
                              : "rounded-tr-none bg-blue-100 dark:bg-blue-900"
                          }`}
                        >
                          <p
                            className={`text-sm leading-relaxed ${
                              isEven
                                ? "text-zinc-800 dark:text-zinc-200"
                                : "text-blue-900 dark:text-blue-100"
                            }`}
                          >
                            {segment.text}
                          </p>
                        </div>

                        {/* 시간 정보 */}
                        <div
                          className={`mt-1 text-xs text-zinc-400 ${
                            isEven ? "" : "text-right"
                          }`}
                        >
                          {Math.round((segment.endMs - segment.startMs) / 1000)}
                          초
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 통계 */}
              <div className="mt-6 grid grid-cols-2 gap-4 border-t border-zinc-200 pt-4 dark:border-zinc-700 md:grid-cols-4">
                {speakers.map((speaker) => (
                  <div
                    key={speaker}
                    className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900"
                  >
                    <div
                      className={`mb-1 inline-block rounded px-2 py-0.5 text-xs font-medium ${getSpeakerColor(
                        speaker as string
                      )}`}
                    >
                      화자 {speaker}
                    </div>
                    <div className="text-2xl font-bold text-zinc-900 dark:text-white">
                      {segmentsBySpeaker[speaker as string].length}
                    </div>
                    <div className="text-xs text-zinc-500">발화</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-4xl rounded-lg bg-white p-12 text-center shadow dark:bg-zinc-800">
            <p className="mb-2 text-4xl">🎤</p>
            <p className="mb-4 text-zinc-600 dark:text-zinc-400">
              화자 정보가 없습니다
            </p>
            <p className="mb-6 text-sm text-zinc-500">
              GPT를 사용하여 화자를 자동으로 구분할 수 있습니다
            </p>

            {/* 화자 수 입력 */}
            <div className="mb-6 flex items-center justify-center gap-3">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                화자 수:
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={speakerCount}
                onChange={(e) => setSpeakerCount(parseInt(e.target.value) || 2)}
                disabled={diarizationLoading}
                className="w-20 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-center text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white"
              />
              <span className="text-sm text-zinc-500">명 (1~10)</span>
            </div>

            {diarizationError && (
              <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                {diarizationError}
              </div>
            )}

            <div className="flex justify-center gap-3">
              <button
                onClick={handleDiarization}
                disabled={diarizationLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {diarizationLoading ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                    화자 분리 중...
                  </>
                ) : (
                  <>🤖 화자 분리 실행</>
                )}
              </button>
              <Link
                href="/"
                className="inline-block rounded-lg bg-zinc-200 px-6 py-3 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
              >
                홈으로
              </Link>
            </div>
          </div>
        )}

        {/* 전체 텍스트 (하단) */}
        <div className="mx-auto mt-12 max-w-4xl rounded-lg bg-white p-6 shadow dark:bg-zinc-800">
          <h2 className="mb-4 text-xl font-bold text-zinc-900 dark:text-white">
            📝 전체 텍스트
          </h2>
          <div className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg bg-zinc-50 p-4 text-sm text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            {transcript.text}
          </div>
        </div>
      </div>

      {/* 삭제 확인 모달 */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-800"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 text-xl font-bold text-zinc-900 dark:text-white">
              전사본 삭제
            </h3>
            <p className="mb-6 text-zinc-600 dark:text-zinc-400">
              이 전사본을 삭제하시겠습니까? 관련된 세그먼트와 청크도 모두
              삭제됩니다. 이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleteLoading}
                className="rounded-lg bg-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-300 disabled:opacity-50 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
              >
                취소
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteLoading ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                    삭제 중...
                  </>
                ) : (
                  "삭제"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
