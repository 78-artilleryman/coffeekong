# Coffee Kong ☕

Next.js 프로젝트 with Supabase & Prisma

## 기술 스택

- **Framework**: Next.js 16
- **Database**: Supabase (PostgreSQL)
- **ORM**: Prisma
- **Vector DB**: pgvector (Supabase 내장)
- **Auth**: Supabase Auth
- **AI/LLM**: LangChain, LangGraph
- **Styling**: Tailwind CSS
- **Language**: TypeScript

## 시작하기

### 1. 의존성 설치

```bash
pnpm install
```

### 2. 환경 변수 설정

`.env.example` 파일을 복사하여 `.env.local` 파일을 생성하고 필요한 값을 입력하세요:

```bash
cp .env.example .env.local
```

필요한 환경 변수:

- `DATABASE_URL`: Supabase PostgreSQL 연결 URL (연결 풀링용)
- `DIRECT_URL`: Supabase PostgreSQL 직접 연결 URL (마이그레이션용)
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase 프로젝트 URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anon 키
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase 서비스 역할 키
- `OPENAI_API_KEY`: OpenAI API 키 (LangChain용)

### 3. Supabase에서 pgvector 확장 활성화

Supabase 대시보드 > Database > Extensions에서 `vector` 확장을 활성화하세요.

또는 SQL 에디터에서 다음 명령어를 실행하세요:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 4. 데이터베이스 마이그레이션

```bash
# Prisma 클라이언트 생성
pnpm prisma generate

# 마이그레이션 생성 및 적용
pnpm prisma migrate dev --name init
```

### 5. 개발 서버 실행

```bash
pnpm dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)를 열어 확인하세요.

## 프로젝트 구조

```
src/
├── app/
│   ├── api/
│   │   └── examples/          # API 라우터 예시
│   │       ├── users/          # 사용자 CRUD
│   │       ├── documents/      # 문서 CRUD (벡터 검색 포함)
│   │       └── supabase-auth/  # Supabase 인증 예시
│   ├── layout.tsx
│   └── page.tsx
├── lib/
│   ├── prisma.ts              # Prisma 클라이언트
│   ├── supabase/
│   │   ├── client.ts          # 브라우저용 Supabase 클라이언트
│   │   ├── server.ts          # 서버용 Supabase 클라이언트
│   │   └── middleware.ts      # Supabase 미들웨어 헬퍼
│   └── langchain/
│       ├── embeddings.ts      # OpenAI 임베딩
│       ├── vectorstore.ts     # Supabase Vector Store
│       ├── chat.ts            # 채팅 모델 & RAG
│       └── graph.ts           # LangGraph 워크플로우
└── middleware.ts              # Next.js 미들웨어

prisma/
├── schema.prisma              # Prisma 스키마
└── migrations/                # 마이그레이션 파일들
```

## 주요 기능

### 1. Prisma ORM

- PostgreSQL 데이터베이스 관리
- 타입 안전한 쿼리
- 자동 마이그레이션

### 2. Supabase

- 인증 및 권한 관리
- 실시간 데이터베이스
- Row Level Security (RLS)

### 3. 벡터 검색 (pgvector)

- 문서 임베딩 저장
- 유사도 검색
- AI/ML 통합 준비

### 4. LangChain & LangGraph

- OpenAI 모델 통합
- RAG (Retrieval-Augmented Generation)
- 복잡한 AI 워크플로우 구성
- 벡터 스토어 통합

## API 예시

### 사용자 생성

```bash
POST /api/examples/users
Content-Type: application/json

{
  "email": "user@example.com",
  "name": "홍길동"
}
```

### 문서 검색 (벡터)

```bash
POST /api/examples/documents/search
Content-Type: application/json

{
  "query": "검색할 내용",
  "limit": 5
}
```

### Supabase 인증

```bash
POST /api/examples/supabase-auth
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

### LangChain 채팅

```bash
POST /api/examples/langchain/chat
Content-Type: application/json

{
  "message": "안녕하세요!",
  "context": "선택적 컨텍스트..."
}
```

### 임베딩 생성

```bash
POST /api/examples/langchain/embeddings
Content-Type: application/json

{
  "text": "벡터로 변환할 텍스트"
}
```

### 벡터 검색 (LangChain)

```bash
GET /api/examples/langchain/vectorstore?query=검색어&k=5&withScore=true
```

### LangGraph 워크플로우

```bash
POST /api/examples/langchain/graph
Content-Type: application/json

{
  "message": "질문 내용",
  "type": "conversation"  // 또는 "rag"
}
```

## Prisma 명령어

```bash
# Prisma Studio 실행 (데이터베이스 GUI)
pnpm prisma studio

# 스키마 변경 후 마이그레이션 생성
pnpm prisma migrate dev --name migration_name

# 프로덕션 마이그레이션 적용
pnpm prisma migrate deploy

# 데이터베이스 초기화 (주의: 모든 데이터 삭제)
pnpm prisma migrate reset

# Prisma 클라이언트 재생성
pnpm prisma generate
```

## 배포

### Vercel 배포

1. Vercel에 프로젝트 연결
2. 환경 변수 설정
3. 빌드 명령어: `pnpm prisma generate && pnpm build`
4. 배포!

## 라이선스

MIT
