import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  mockUseWriteContract: vi.fn(),
  mockUseWaitForTransactionReceipt: vi.fn(),
  mockUseReadContract: vi.fn(),
}));

vi.mock('wagmi', () => ({
  useWriteContract: mocks.mockUseWriteContract,
  useWaitForTransactionReceipt: mocks.mockUseWaitForTransactionReceipt,
  useReadContract: mocks.mockUseReadContract,
}));

vi.mock('@/lib/contracts', () => ({
  getAgentFactoryContract: () => ({
    address: '0x1234',
    abi: [],
  }),
}));

vi.mock('viem', () => ({
  parseEther: (val: string) => BigInt(Math.round(parseFloat(val) * 1e18)),
}));

import { useDeploy, useDeployFee } from '../use-deploy';

describe('useDeploy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockUseWriteContract.mockReturnValue({
      data: undefined,
      writeContract: vi.fn(),
      isPending: false,
      error: null,
    });
    mocks.mockUseWaitForTransactionReceipt.mockReturnValue({
      data: undefined,
      isLoading: false,
      isSuccess: false,
      error: null,
    });
  });

  it('returns idle status initially', () => {
    const { result } = renderHook(() => useDeploy());
    expect(result.current.status).toBe('idle');
  });

  it('returns confirmed status when receipt is available', () => {
    mocks.mockUseWaitForTransactionReceipt.mockReturnValue({
      data: { transactionHash: '0xabc' },
      isLoading: false,
      isSuccess: true,
      error: null,
    });

    const { result } = renderHook(() => useDeploy());
    expect(result.current.status).toBe('confirmed');
  });

  it('returns pending status when confirming', () => {
    mocks.mockUseWriteContract.mockReturnValue({
      data: '0xhash',
      writeContract: vi.fn(),
      isPending: false,
      error: null,
    });
    mocks.mockUseWaitForTransactionReceipt.mockReturnValue({
      data: undefined,
      isLoading: true,
      isSuccess: false,
      error: null,
    });

    const { result } = renderHook(() => useDeploy());
    expect(result.current.status).toBe('pending');
  });

  it('returns failed status on write error', () => {
    mocks.mockUseWriteContract.mockReturnValue({
      data: undefined,
      writeContract: vi.fn(),
      isPending: false,
      error: new Error('User rejected'),
    });

    const { result } = renderHook(() => useDeploy());
    expect(result.current.status).toBe('failed');
    expect(result.current.error).toBe('User rejected');
  });

  it('provides deploy function', () => {
    const { result } = renderHook(() => useDeploy());
    expect(typeof result.current.deploy).toBe('function');
  });
});

describe('useDeployFee', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads deploy fee from contract', () => {
    mocks.mockUseReadContract.mockReturnValue({
      data: 5000000000000000n,
      isLoading: false,
    });

    renderHook(() => useDeployFee());
    expect(mocks.mockUseReadContract).toHaveBeenCalled();
  });
});
