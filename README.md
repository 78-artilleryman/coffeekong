# 🎙️ CoffeeKong

음성 파일을 텍스트로 변환하고, AI와 대화할 수 있는 지능형 전사 서비스입니다.

## 📖 서비스 소개

CoffeeKong은 음성 파일을 빠르고 정확하게 텍스트로 변환하고, 화자를 자동으로 구분하며, 전사본 내용을 기반으로 AI와 대화할 수 있는 웹 애플리케이션입니다.

### 주요 기능

- 🎤 **AssemblyAI 기반 음성 전사**: 고급 AI로 빠르고 정확한 음성-텍스트 변환 (10분당 약 1분 처리)
- 🎭 **자동 화자 분리**: AI가 대화에서 화자를 자동으로 구분하여 채팅 형식으로 표시
- 💬 **RAG 질의응답**: 전사본 내용을 기반으로 AI에게 질문하고 답변받기
- 🌐 **하이브리드 모드**: 전사본 + 인터넷 검색을 결합하여 최신 정보까지 제공
- 📋 **전사본 관리**: 모든 전사본을 저장하고 관리하며 언제든 다시 확인 가능
- ⚡ **빠른 처리**: 최적화된 워크플로우로 전사본 생성 및 청크 분할 자동화

## 🛠️ 기술 스택

### 프론트엔드

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI**: React 19

### 백엔드

- **Runtime**: Node.js
- **Database**: PostgreSQL (Supabase)
- **ORM**: Prisma
- **API**: Next.js API Routes

### AI/ML 서비스

- **전사**: AssemblyAI API
- **RAG (전사본 전용)**: OpenAI GPT-4o-mini
- **인터넷 검색 포함 RAG**: Perplexity API

### 인프라

- **Vector DB**: pgvector (선택사항)
- **배포**: Vercel (권장)

## 🚀 시작하기

### 1. 저장소 클론

```bash
git clone <repository-url>
cd coffeekong
```

### 2. 의존성 설치

```bash
# pnpm이 설치되어 있지 않다면
npm install -g pnpm

# 의존성 설치
pnpm install
```

### 3. 환경 변수 설정

프로젝트 루트에 `.env.local` 파일을 생성하고 다음 환경 변수를 설정하세요:

```env
# Database (PostgreSQL)
# 로컬 PostgreSQL 사용 시
DATABASE_URL="postgresql://user:password@localhost:5432/coffeekong"

# Supabase 사용 시 (선택사항)
# DATABASE_URL="postgresql://postgres:[비밀번호]@db.[프로젝트-참조].supabase.co:5432/postgres?pgbouncer=true"
# DIRECT_URL="postgresql://postgres:[비밀번호]@db.[프로젝트-참조].supabase.co:5432/postgres"

# AssemblyAI (필수) - 음성 전사용
# https://www.assemblyai.com/ 에서 발급
ASSEMBLYAI_API_KEY="your-assemblyai-api-key"

# OpenAI (필수) - RAG 질의응답용
# https://platform.openai.com/api-keys 에서 발급
OPENAI_API_KEY="sk-your-openai-api-key"

# Perplexity (선택사항) - 인터넷 검색 포함 RAG용
# https://www.perplexity.ai/settings/api 에서 발급
PERPLEXITY_API_KEY="pplx-your-perplexity-api-key"

# Supabase (선택사항) - Supabase를 사용하는 경우
# https://supabase.com/dashboard/project/_/settings/api 에서 확인
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

**필수 환경 변수:**

- `DATABASE_URL`: PostgreSQL 데이터베이스 연결 URL
- `ASSEMBLYAI_API_KEY`: AssemblyAI API 키 (음성 전사 필수)
- `OPENAI_API_KEY`: OpenAI API 키 (RAG 기능 필수)

**선택사항:**

- `PERPLEXITY_API_KEY`: 인터넷 검색 기능 사용 시 필요
- Supabase 관련 변수: Supabase를 데이터베이스로 사용하는 경우

**중요**:

- `.env.local` 파일은 Git에 커밋하지 마세요 (`.gitignore`에 포함되어 있습니다)
- 실제 API 키 값은 `your-xxx-api-key` 부분을 실제 키로 교체해야 합니다
- 각 API 키 발급 링크는 위 주석에 포함되어 있습니다

#### API 키 발급 방법

**AssemblyAI API 키**

1. [AssemblyAI](https://www.assemblyai.com/) 회원가입
2. 대시보드에서 API 키 생성
3. 무료 티어: 월 $0 (5시간 전사), 유료: $0.25/시간

**OpenAI API 키**

1. [OpenAI Platform](https://platform.openai.com/) 접속
2. API Keys 메뉴에서 새 키 생성
3. GPT-4o-mini 사용 (저렴하고 빠름)

**Perplexity API 키** (선택사항)

1. [Perplexity AI](https://www.perplexity.ai/settings/api) 접속
2. API 키 생성 및 크레딧 충전 ($5-10 권장)
3. 인터넷 검색 기능 사용 시 필요

### 4. 데이터베이스 설정

#### PostgreSQL 데이터베이스 생성

로컬 PostgreSQL 또는 Supabase를 사용할 수 있습니다.

**로컬 PostgreSQL:**

```bash
# PostgreSQL 설치 후
createdb coffeekong
```

**Supabase 사용 시:**

1. [Supabase](https://supabase.com)에서 프로젝트 생성
2. Database URL 복사하여 `DATABASE_URL`에 설정

#### 데이터베이스 마이그레이션

```bash
# Prisma 클라이언트 생성
pnpm prisma generate

# 데이터베이스 마이그레이션 실행
pnpm prisma migrate dev

# 또는 스키마를 직접 푸시 (프로토타입용)
pnpm prisma db push
```

### 5. 개발 서버 실행

```bash
pnpm dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어 확인하세요.

## 📁 프로젝트 구조

```
coffeekong/
├── prisma/
│   └── schema.prisma          # 데이터베이스 스키마
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── transcribe/
│   │   │   │   └── route.ts              # 음성 파일 전사 API
│   │   │   └── transcripts/
│   │   │       ├── route.ts              # 전사본 목록 조회
│   │   │       └── [id]/
│   │   │           ├── route.ts          # 전사본 상세/삭제
│   │   │           ├── chat/
│   │   │           │   └── route.ts      # RAG 질의응답 API
│   │   │           └── diarize/
│   │   │               └── route.ts      # 화자 분리 API (레거시)
│   │   ├── page.tsx                      # 메인 페이지 (업로드/목록)
│   │   └── transcripts/
│   │       └── [id]/
│   │           └── page.tsx              # 전사본 상세 페이지
│   └── lib/
│       ├── assemblyai/
│       │   └── transcription.ts          # AssemblyAI 전사 로직
│       ├── prisma.ts                     # Prisma 클라이언트
│       └── supabase/                     # Supabase 클라이언트 (선택사항)
└── package.json
```

## 💻 사용 방법

### 1. 음성 파일 전사

1. 메인 페이지에서 "🎤 새 전사" 탭 선택
2. 음성 파일 업로드 (mp3, wav, m4a, webm, ogg 지원, 최대 25MB)
3. 태그 입력 (선택사항)
4. 화자 분리 활성화 (선택사항)
   - 활성화 시 예상 화자 수 입력
5. "음성 파일 전사하기" 버튼 클릭
6. 완료 후 상세 페이지에서 확인

### 2. 전사본 확인

1. "📋 전사 기록" 탭에서 모든 전사본 목록 확인
2. 전사본 클릭하여 상세 페이지 이동
3. 화자별 대화를 채팅 형식으로 확인

### 3. AI와 대화 (RAG)

1. 전사본 상세 페이지로 이동
2. 오른쪽 "🤖 AI 어시스턴트" 패널 사용
3. 인터넷 검색 토글 선택:
   - **OFF**: 전사본 내용만 사용 (빠르고 저렴)
   - **ON**: 전사본 + 인터넷 검색 결합 (최신 정보 포함)
4. 질문 입력 예시:
   - "주요 내용을 요약해줘"
   - "어떤 결정이 내려졌나요?"
   - "이 회의에서 언급된 AI 트렌드의 최신 정보는?" (인터넷 검색 ON)

### 4. 전사본 삭제

1. 전사 기록 목록 또는 상세 페이지에서 삭제 버튼 클릭
2. 확인 메시지에서 확인
3. 전사본과 관련된 모든 데이터(세그먼트, 청크) 자동 삭제

## 🔧 주요 명령어

```bash
# 개발 서버 실행
pnpm dev

# 프로덕션 빌드
pnpm build

# 프로덕션 서버 실행
pnpm start

# Prisma 관련
pnpm prisma generate          # Prisma 클라이언트 생성
pnpm prisma migrate dev       # 마이그레이션 생성 및 적용
pnpm prisma db push           # 스키마를 DB에 직접 푸시
pnpm prisma studio            # 데이터베이스 GUI 열기

# Linting
pnpm lint
```

## 🗄️ 데이터베이스 스키마

주요 모델:

- `transcripts`: 전사본 메타데이터
- `transcript_segments`: 전사본 세그먼트 (화자 정보 포함)
- `chunks`: 전사본 청크 (RAG용)
- `sources`: 오디오 파일 소스 정보

자세한 스키마는 `prisma/schema.prisma` 파일을 참고하세요.


## 📞 문의

문제가 발생하거나 제안사항이 있으시면 이슈를 등록해주세요

이메일 : ywy040150@gmail.com

---

Made with ☕ by CoffeeKong Team
