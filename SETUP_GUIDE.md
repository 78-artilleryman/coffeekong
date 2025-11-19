# 설정 가이드 📝

## 설치 완료 항목 ✅

### 1. 패키지 설치

- ✅ `@prisma/client` - Prisma 클라이언트
- ✅ `prisma` - Prisma CLI (dev dependency)
- ✅ `@supabase/supabase-js` - Supabase JavaScript 클라이언트
- ✅ `@supabase/ssr` - Supabase Server-Side Rendering 지원

### 2. Prisma 설정

- ✅ `prisma/schema.prisma` - 데이터베이스 스키마
  - PostgreSQL 설정
  - pgvector 확장 지원
  - User 및 Document 예시 모델
- ✅ `prisma.config.ts` - Prisma 설정 파일
- ✅ `.env.example` - 환경 변수 템플릿

### 3. Supabase 클라이언트

- ✅ `src/lib/supabase/client.ts` - 브라우저용 클라이언트
- ✅ `src/lib/supabase/server.ts` - 서버용 클라이언트
- ✅ `src/lib/supabase/middleware.ts` - 미들웨어 헬퍼
- ✅ `src/middleware.ts` - Next.js 미들웨어

### 4. Prisma 클라이언트

- ✅ `src/lib/prisma.ts` - Prisma 클라이언트 싱글톤

### 5. API 라우터 예시

- ✅ `src/app/api/examples/users/route.ts` - 사용자 CRUD
- ✅ `src/app/api/examples/documents/route.ts` - 문서 CRUD
- ✅ `src/app/api/examples/documents/search/route.ts` - 벡터 검색
- ✅ `src/app/api/examples/supabase-auth/route.ts` - Supabase 인증

### 6. 스크립트 추가

- ✅ `pnpm db:generate` - Prisma 클라이언트 생성
- ✅ `pnpm db:push` - 스키마를 DB에 푸시
- ✅ `pnpm db:migrate` - 마이그레이션 생성 및 적용
- ✅ `pnpm db:migrate:deploy` - 프로덕션 마이그레이션
- ✅ `pnpm db:studio` - Prisma Studio 실행

---

## 다음 단계 🚀

### 1. Supabase 프로젝트 생성

1. [supabase.com](https://supabase.com)에서 새 프로젝트 생성
2. Database 설정에서 비밀번호 저장
3. Settings > API에서 URL과 키 확인

### 2. 환경 변수 설정

`.env.example`을 복사하여 `.env.local` 파일을 생성하세요:

```bash
cp .env.example .env.local
```

`.env.local` 파일을 열어 다음 값들을 입력하세요:

```env
# Database URLs
DATABASE_URL="postgresql://postgres:[비밀번호]@db.[프로젝트-참조].supabase.co:5432/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres:[비밀번호]@db.[프로젝트-참조].supabase.co:5432/postgres"

# Supabase 설정
NEXT_PUBLIC_SUPABASE_URL=https://[프로젝트-참조].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[anon-키]
SUPABASE_SERVICE_ROLE_KEY=[service-role-키]
```

**어디서 찾나요?**

- **프로젝트 참조**: Supabase 대시보드 > Settings > General
- **비밀번호**: 프로젝트 생성 시 설정한 데이터베이스 비밀번호
- **API 키들**: Supabase 대시보드 > Settings > API

### 3. pgvector 확장 활성화

Supabase 대시보드에서:

1. **Database** > **Extensions** 이동
2. **vector** 검색
3. **Enable** 클릭

또는 SQL Editor에서:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 4. Prisma 설정 및 마이그레이션

```bash
# 1. Prisma 클라이언트 생성
pnpm db:generate

# 2. 데이터베이스 마이그레이션 (개발 환경)
pnpm db:migrate

# 또는 스키마를 직접 푸시 (프로토타입용)
pnpm db:push
```

### 5. 개발 서버 실행

```bash
pnpm dev
```

### 6. API 테스트

#### 사용자 생성

```bash
curl -X POST http://localhost:3000/api/examples/users \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "name": "테스트"}'
```

#### 사용자 목록 조회

```bash
curl http://localhost:3000/api/examples/users
```

#### Prisma Studio 실행 (데이터베이스 GUI)

```bash
pnpm db:studio
```

---

## 데이터베이스 스키마

현재 `prisma/schema.prisma`에 다음 모델이 정의되어 있습니다:

### User 모델

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### Document 모델 (벡터 검색용)

```prisma
model Document {
  id        String   @id @default(cuid())
  content   String
  embedding Unsupported("vector(1536)")? // OpenAI embedding
  metadata  Json?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

필요에 따라 스키마를 수정하고 `pnpm db:migrate`를 실행하세요!

---

## 유용한 명령어

```bash
# Prisma Studio (데이터베이스 GUI)
pnpm db:studio

# 스키마 변경 후 마이그레이션
pnpm db:migrate

# 프로덕션 마이그레이션
pnpm db:migrate:deploy

# 데이터베이스 초기화 (주의: 모든 데이터 삭제)
pnpm prisma migrate reset
```

---

## 벡터 검색 사용법

### 1. OpenAI API 키 설정 (선택사항)

임베딩 생성을 위해 OpenAI API를 사용하려면:

```bash
pnpm add openai
```

`.env.local`에 추가:

```env
OPENAI_API_KEY=sk-...
```

### 2. 임베딩 생성 헬퍼 작성

```typescript
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function generateEmbedding(text: string) {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0].embedding;
}
```

### 3. API 라우터에서 사용

`src/app/api/examples/documents/route.ts`와
`src/app/api/examples/documents/search/route.ts`에서
주석 처리된 부분을 활성화하세요!

---

## 문제 해결

### Prisma 클라이언트를 찾을 수 없음

```bash
pnpm db:generate
```

### 마이그레이션 오류

```bash
# 마이그레이션 상태 확인
pnpm prisma migrate status

# 마이그레이션 재설정 (주의: 데이터 삭제)
pnpm prisma migrate reset
```

### Supabase 연결 오류

- `.env.local` 파일의 환경 변수 확인
- Supabase 프로젝트가 활성화되어 있는지 확인
- 방화벽 설정 확인

---

## 추가 리소스

- [Prisma 문서](https://www.prisma.io/docs)
- [Supabase 문서](https://supabase.com/docs)
- [pgvector 문서](https://github.com/pgvector/pgvector)
- [Next.js App Router](https://nextjs.org/docs/app)

Happy coding! ☕✨
