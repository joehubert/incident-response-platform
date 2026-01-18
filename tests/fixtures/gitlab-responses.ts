export const mockCommitResponse = {
  id: 'abc123def456789',
  short_id: 'abc123',
  title: 'Fix database connection handling',
  message: 'Fix database connection handling\n\nAdded proper cleanup in error handlers',
  author_name: 'John Doe',
  author_email: 'john@example.com',
  committed_date: '2026-01-14T09:30:00Z',
  web_url: 'https://gitlab.com/test/repo/-/commit/abc123def456789',
  stats: {
    additions: 15,
    deletions: 5,
    total: 20,
  },
};

export const mockCommitDiffResponse = [
  {
    old_path: 'src/db/connection.ts',
    new_path: 'src/db/connection.ts',
    a_mode: '100644',
    b_mode: '100644',
    diff: `@@ -40,6 +40,10 @@ export class Database {
   async connect() {
     const pool = await this.createPool();
+    pool.on('error', (err) => {
+      this.cleanup(pool);
+      throw err;
+    });
     return pool;
   }
`,
    new_file: false,
    renamed_file: false,
    deleted_file: false,
  },
];

export const mockCommitsListResponse = [
  mockCommitResponse,
  {
    id: 'def456789abc123',
    short_id: 'def456',
    title: 'Update dependencies',
    message: 'Update dependencies to latest versions',
    author_name: 'Jane Smith',
    author_email: 'jane@example.com',
    committed_date: '2026-01-14T08:00:00Z',
    web_url: 'https://gitlab.com/test/repo/-/commit/def456789abc123',
    stats: {
      additions: 50,
      deletions: 45,
      total: 95,
    },
  },
];

export const mockMergeRequestResponse = {
  id: 789,
  iid: 42,
  title: 'Fix database connection issues',
  description: 'This MR fixes connection pool exhaustion under high load',
  state: 'merged',
  merged_at: '2026-01-14T09:25:00Z',
  author: {
    username: 'johndoe',
    name: 'John Doe',
  },
  web_url: 'https://gitlab.com/test/repo/-/merge_requests/42',
  sha: 'abc123def456789',
};

export const mockPipelineResponse = {
  id: 12345,
  status: 'success',
  ref: 'main',
  sha: 'abc123def456789',
  created_at: '2026-01-14T09:30:00Z',
  finished_at: '2026-01-14T09:35:00Z',
  web_url: 'https://gitlab.com/test/repo/-/pipelines/12345',
};
