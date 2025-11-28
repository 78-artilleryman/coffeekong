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
  const [selectedSpeaker, setSelectedSpeaker] = useState<string | null>(null);

  useEffect(() => {
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

    if (params.id) {
      fetchTranscript();
    }
  }, [params.id]);

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

  // 화자별로 그룹화
  const segmentsBySpeaker = speakers.reduce((acc, speaker) => {
    acc[speaker as string] = transcript.segments.filter(
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
            <Link
              href="/"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
            >
              홈으로
            </Link>
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

      {/* 화자 필터 */}
      {speakers.length > 0 && (
        <div className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="container mx-auto px-4 py-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                🎭 화자 필터:
              </span>
              <button
                onClick={() => setSelectedSpeaker(null)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  selectedSpeaker === null
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                    : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300"
                }`}
              >
                전체 ({speakers.length}명)
              </button>
              {speakers.map((speaker) => (
                <button
                  key={speaker}
                  onClick={() => setSelectedSpeaker(speaker as string)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                    selectedSpeaker === speaker
                      ? getSpeakerColor(speaker as string)
                      : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  화자 {speaker} ({segmentsBySpeaker[speaker as string].length})
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 컨텐츠 */}
      <div className="container mx-auto px-4 py-8">
        {/* 화자별 뷰 */}
        {speakers.length > 0 ? (
          <div className="mx-auto max-w-6xl">
            {
              <div className="grid gap-6 md:grid-cols-2">
                {speakers
                  .filter(
                    (speaker) =>
                      selectedSpeaker === null || speaker === selectedSpeaker
                  )
                  .map((speaker) => (
                    <div
                      key={speaker}
                      className="rounded-lg bg-white p-6 shadow dark:bg-zinc-800"
                    >
                      <div className="mb-4 flex items-center justify-between">
                        <h2
                          className={`rounded-lg px-4 py-2 text-lg font-bold ${getSpeakerColor(
                            speaker as string
                          )}`}
                        >
                          화자 {speaker}
                        </h2>
                        <span className="text-sm text-zinc-500">
                          {segmentsBySpeaker[speaker as string].length}개 발화
                        </span>
                      </div>

                      <div className="max-h-96 space-y-3 overflow-y-auto">
                        {segmentsBySpeaker[speaker as string].map((segment) => (
                          <div
                            key={segment.id}
                            className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900"
                          >
                            <div className="mb-1 text-xs text-zinc-500">
                              {formatTime(segment.startMs)} -{" "}
                              {formatTime(segment.endMs)}
                            </div>
                            <p className="text-sm text-zinc-700 dark:text-zinc-300">
                              {segment.text}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            }
          </div>
        ) : (
          <div className="mx-auto max-w-4xl rounded-lg bg-white p-12 text-center shadow dark:bg-zinc-800">
            <p className="mb-2 text-4xl">🎤</p>
            <p className="mb-4 text-zinc-600 dark:text-zinc-400">
              화자 정보가 없습니다
            </p>
            <p className="mb-6 text-sm text-zinc-500">
              화자 분리 기능을 활성화하여 전사하면 화자별로 구분된 결과를 볼 수
              있습니다
            </p>
            <Link
              href="/"
              className="inline-block rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700"
            >
              새 전사 시작하기
            </Link>
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
    </div>
  );
}
