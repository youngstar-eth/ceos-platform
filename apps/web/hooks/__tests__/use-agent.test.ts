import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
  mockUseMutation: vi.fn(),
  mockUseQueryClient: vi.fn(() => ({
    invalidateQueries: vi.fn(),
  })),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: mocks.mockUseQuery,
  useMutation: mocks.mockUseMutation,
  useQueryClient: mocks.mockUseQueryClient,
}));

import { useAgents, useAgent } from '../use-agent';

describe('useAgents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls useQuery with correct query key', () => {
    mocks.mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });

    useAgents(1, 10);

    expect(mocks.mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['agents', 1, 10],
      }),
    );
  });

  it('returns loading state initially', () => {
    mocks.mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });

    const result = useAgents();
    expect(result.isLoading).toBe(true);
    expect(result.data).toBeUndefined();
  });

  it('returns agents data on success', () => {
    const mockData = {
      success: true,
      data: [{ id: '1', name: 'TestAgent', status: 'ACTIVE' }],
      pagination: { page: 1, limit: 10, total: 1 },
    };

    mocks.mockUseQuery.mockReturnValue({
      data: mockData,
      isLoading: false,
      error: null,
    });

    const result = useAgents();
    expect(result.isLoading).toBe(false);
    expect(result.data?.data).toHaveLength(1);
    expect(result.data?.data[0]?.name).toBe('TestAgent');
  });

  it('returns error state on failure', () => {
    mocks.mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Network error'),
    });

    const result = useAgents();
    expect(result.error).toBeInstanceOf(Error);
  });
});

describe('useAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls useQuery with agent id', () => {
    mocks.mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });

    useAgent('agent-123');

    expect(mocks.mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['agent', 'agent-123'],
        enabled: true,
      }),
    );
  });

  it('disables query when id is empty', () => {
    mocks.mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    });

    useAgent('');

    expect(mocks.mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
      }),
    );
  });
});
