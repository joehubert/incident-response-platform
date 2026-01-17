export interface GitLabConfig {
  url: string;
  token: string;
}

export interface GitLabCommit {
  sha: string;
  shortId: string;
  message: string;
  title: string;
  author: {
    name: string;
    email: string;
  };
  committedDate: Date;
  repository: string;
  webUrl: string;
  stats: {
    additions: number;
    deletions: number;
    total: number;
  };
}

export interface GitLabCommitDiff {
  commitSha: string;
  files: Array<{
    oldPath: string;
    newPath: string;
    diff: string;
    newFile: boolean;
    renamedFile: boolean;
    deletedFile: boolean;
  }>;
}

export interface GitLabPipeline {
  id: number;
  sha: string;
  ref: string;
  status: 'success' | 'failed' | 'running' | 'pending' | 'canceled' | 'skipped';
  webUrl: string;
  createdAt: Date;
  finishedAt?: Date;
}

export interface GitLabMergeRequest {
  id: number;
  iid: number;
  title: string;
  description: string;
  state: 'opened' | 'closed' | 'merged';
  webUrl: string;
  author: {
    name: string;
    username: string;
  };
  mergedAt?: Date;
}

export interface GetCommitsOptions {
  repository: string;
  since?: Date;
  until?: Date;
  path?: string;
  branch?: string;
  perPage?: number;
}
