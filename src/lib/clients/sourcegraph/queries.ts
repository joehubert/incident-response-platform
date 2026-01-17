export const SEARCH_QUERY = `
query Search($query: String!) {
  search(query: $query, version: V2) {
    results {
      matchCount
      repositoriesCount
      results {
        ... on FileMatch {
          repository {
            name
          }
          file {
            path
          }
          lineMatches {
            lineNumber
            preview
          }
        }
      }
    }
  }
}
`;

export const FILE_CONTENT_QUERY = `
query FileContent($repository: String!, $path: String!) {
  repository(name: $repository) {
    commit(rev: "HEAD") {
      file(path: $path) {
        content
        language
      }
    }
  }
}
`;
