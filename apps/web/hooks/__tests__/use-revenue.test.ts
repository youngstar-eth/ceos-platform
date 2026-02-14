import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
  mockUseQueryClient: vi.fn(() => ({
    invalidateQueries: vi.fn(),
  })),
  mockUseReadContract: vi.fn(),
  mockUseWriteContract: vi.fn(),
  mockUseAccount: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: mocks.mockUseQuery,
  useQueryClient: mocks.mockUseQueryClient,
}));

vi.mock('wagmi', () => ({
  useReadContract: mocks.mockUseReadContract,
  useWriteContract: mocks.mockUseWriteContract,
  useAccount: mocks.mockUseAccount,
}));

vi.mock('@/lib/contracts', () => ({
  getRevenuePoolContract: () => ({
    address: '0x1234',
    abi: [],
  }),
  getCreatorScoreContract: () => ({
    address: '0x5678',
    abi: [],
  }),
}));

import { useRevenue, useClaimableAmount, useCurrentEpoch } from '../use-revenue';

describe('useRevenue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockUseAccount.mockReturnValue({
      address: '0xtest',
      isConnected: true,
    });
  });

  it('calls useQuery with revenue key', () => {
    mocks.mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });

    useRevenue();

    expect(mocks.mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['revenue'],
      }),
    );
  });
});

describe('useClaimableAmount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockUseAccount.mockReturnValue({
      address: '0xtest',
      isConnected: true,
    });
  });

  it('reads claimable amount from contract', () => {
    mocks.mockUseReadContract.mockReturnValue({
      data: 1000000000000000000n,
      isLoading: false,
    });

    const result = useClaimableAmount();
    expect(mocks.mockUseReadContract).toHaveBeenCalled();
  });

  it('disables when no address', () => {
    mocks.mockUseAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
    });

    useClaimableAmount();

    expect(mocks.mockUseReadContract).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({
          enabled: false,
        }),
      }),
    );
  });
});

describe('useCurrentEpoch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads current epoch from contract', () => {
    mocks.mockUseReadContract.mockReturnValue({
      data: 12n,
      isLoading: false,
    });

    useCurrentEpoch();
    expect(mocks.mockUseReadContract).toHaveBeenCalled();
  });
});
