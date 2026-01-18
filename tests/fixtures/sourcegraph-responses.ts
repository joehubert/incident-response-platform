export const mockSearchResponse = {
  data: {
    search: {
      results: {
        resultCount: 3,
        results: [
          {
            __typename: 'FileMatch',
            file: {
              path: 'src/db/connection.ts',
              repository: {
                name: 'test/repo',
              },
            },
            lineMatches: [
              {
                lineNumber: 42,
                preview: '    await pool.connect();',
                offsetAndLengths: [[10, 7]],
              },
              {
                lineNumber: 55,
                preview: '    pool.on("error", handleError);',
                offsetAndLengths: [[4, 4]],
              },
            ],
          },
          {
            __typename: 'FileMatch',
            file: {
              path: 'src/db/pool.ts',
              repository: {
                name: 'test/repo',
              },
            },
            lineMatches: [
              {
                lineNumber: 15,
                preview: 'export function createPool(config: PoolConfig) {',
                offsetAndLengths: [[16, 10]],
              },
            ],
          },
        ],
      },
    },
  },
};

export const mockSymbolSearchResponse = {
  data: {
    search: {
      results: {
        resultCount: 2,
        results: [
          {
            __typename: 'SymbolMatch',
            symbol: {
              name: 'connect',
              kind: 'METHOD',
              containerName: 'Database',
              language: 'TypeScript',
            },
            file: {
              path: 'src/db/connection.ts',
              repository: {
                name: 'test/repo',
              },
            },
          },
          {
            __typename: 'SymbolMatch',
            symbol: {
              name: 'createPool',
              kind: 'FUNCTION',
              containerName: null,
              language: 'TypeScript',
            },
            file: {
              path: 'src/db/pool.ts',
              repository: {
                name: 'test/repo',
              },
            },
          },
        ],
      },
    },
  },
};
