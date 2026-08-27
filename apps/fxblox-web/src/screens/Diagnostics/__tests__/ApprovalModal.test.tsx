/**
 * Port of apps/box/src/screens/Diagnostics/__tests__/ApprovalModal.test.tsx — tier 2 single tap, tier 3 security
 * code + press-and-hold (pointer events + 2 s timer), dedup, cancellation / unmount safety.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestProviders } from '@/test/helpers/renderWithProviders';
import { ApprovalModal, TIER_3_HOLD_MS } from '@/screens/Diagnostics/ApprovalModal';
import type { RecommendedActionEvent } from '@/utils/bloxAiEvents';

const tier2Action: RecommendedActionEvent = {
  type: 'recommended_action',
  action_id: 'a-tier2',
  action_name: 'restart_fula',
  args: {},
  reasoning: 'Kubo API hung — restart will clear it.',
  confidence: 0.8,
  tier: 2,
  approval_token: 't'.repeat(80),
};

const tier3Action: RecommendedActionEvent = {
  type: 'recommended_action',
  action_id: 'a-tier3',
  action_name: 'reset',
  args: {},
  reasoning: 'Config seems corrupt; full reset proposed.',
  confidence: 0.6,
  tier: 3,
  approval_token: 'k'.repeat(80),
};

function renderModal(props: Partial<React.ComponentProps<typeof ApprovalModal>> = {}) {
  const onApprove = vi.fn();
  const onCancel = vi.fn();
  const utils = render(
    <TestProviders>
      <ApprovalModal action={tier3Action} onApprove={onApprove} onCancel={onCancel} {...props} />
    </TestProviders>,
  );
  return { onApprove, onCancel, ...utils };
}

const typeCode = (code: string) =>
  fireEvent.change(screen.getByTestId('approval-security-code-input'), { target: { value: code } });

describe('ApprovalModal — tier 2', () => {
  it('renders action_name + reasoning + Approve; Approve fires onApprove(null)', () => {
    const { onApprove } = renderModal({ action: tier2Action });
    expect(screen.getByTestId('approval-action-name')).toHaveTextContent('restart_fula');
    expect(screen.getByTestId('approval-reasoning')).toHaveTextContent('Kubo API hung — restart will clear it.');
    expect(screen.queryByTestId('approval-tier3-hold')).toBeNull();
    expect(screen.queryByTestId('approval-security-code-input')).toBeNull();
    fireEvent.click(screen.getByTestId('approval-tier2-approve'));
    expect(onApprove).toHaveBeenCalledWith(null);
  });

  it('Approve is disabled while executing (dedup guard)', () => {
    const { onApprove } = renderModal({ action: tier2Action, executing: true });
    fireEvent.click(screen.getByTestId('approval-tier2-approve'));
    expect(onApprove).not.toHaveBeenCalled();
  });

  it('Cancel fires onCancel', () => {
    const { onCancel } = renderModal({ action: tier2Action });
    fireEvent.click(screen.getByTestId('approval-cancel'));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('ApprovalModal — tier 3', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the security-code input + hold button (no tier-2 Approve)', () => {
    renderModal();
    expect(screen.getByTestId('approval-security-code-input')).toBeInTheDocument();
    expect(screen.getByTestId('approval-tier3-hold')).toBeInTheDocument();
    expect(screen.queryByTestId('approval-tier2-approve')).toBeNull();
  });

  it('hold is disabled until the code is exactly 4 digits', () => {
    const { onApprove } = renderModal();
    const hold = screen.getByTestId('approval-tier3-hold');
    expect(hold).toBeDisabled();
    fireEvent.pointerDown(hold);
    act(() => {
      vi.advanceTimersByTime(TIER_3_HOLD_MS);
    });
    fireEvent.pointerUp(hold);
    expect(onApprove).not.toHaveBeenCalled();

    typeCode('123');
    expect(screen.getByTestId('approval-tier3-hold')).toBeDisabled();
    fireEvent.pointerDown(screen.getByTestId('approval-tier3-hold'));
    act(() => {
      vi.advanceTimersByTime(TIER_3_HOLD_MS);
    });
    expect(onApprove).not.toHaveBeenCalled();
  });

  it('a full 2 s hold with a valid code fires onApprove(code) and animates the fill', () => {
    const { onApprove } = renderModal();
    typeCode('1234');
    const hold = screen.getByTestId('approval-tier3-hold');
    expect(hold).toBeEnabled();
    fireEvent.pointerDown(hold);
    expect(screen.getByTestId('approval-hold-progress').style.width).toBe('100%');
    expect(hold).toHaveAttribute('data-holding', 'true');
    act(() => {
      vi.advanceTimersByTime(TIER_3_HOLD_MS);
    });
    expect(onApprove).toHaveBeenCalledWith('1234');
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it('releasing before 2 s does NOT fire onApprove (and resets the fill)', () => {
    const { onApprove } = renderModal();
    typeCode('1234');
    const hold = screen.getByTestId('approval-tier3-hold');
    fireEvent.pointerDown(hold);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    fireEvent.pointerUp(hold);
    expect(screen.getByTestId('approval-hold-progress').style.width).toBe('0%');
    act(() => {
      vi.advanceTimersByTime(TIER_3_HOLD_MS);
    });
    expect(onApprove).not.toHaveBeenCalled();
  });

  it('the pointer leaving the button cancels the hold', () => {
    const { onApprove } = renderModal();
    typeCode('1234');
    const hold = screen.getByTestId('approval-tier3-hold');
    fireEvent.pointerDown(hold);
    fireEvent.pointerLeave(hold);
    act(() => {
      vi.advanceTimersByTime(TIER_3_HOLD_MS * 2);
    });
    expect(onApprove).not.toHaveBeenCalled();
  });

  it('changing the security code mid-hold resets the timer', () => {
    const { onApprove } = renderModal();
    typeCode('1234');
    fireEvent.pointerDown(screen.getByTestId('approval-tier3-hold'));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    typeCode('5678');
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onApprove).not.toHaveBeenCalled();
  });

  it('keyboard: holding Space for 2 s approves, releasing early does not', () => {
    const { onApprove } = renderModal();
    typeCode('1234');
    const hold = screen.getByTestId('approval-tier3-hold');
    fireEvent.keyDown(hold, { key: ' ' });
    fireEvent.keyUp(hold, { key: ' ' });
    act(() => {
      vi.advanceTimersByTime(TIER_3_HOLD_MS);
    });
    expect(onApprove).not.toHaveBeenCalled();
    fireEvent.keyDown(hold, { key: 'Enter' });
    act(() => {
      vi.advanceTimersByTime(TIER_3_HOLD_MS);
    });
    expect(onApprove).toHaveBeenCalledWith('1234');
  });

  it('unmount during a pending hold does not leak the timer', () => {
    const { onApprove, unmount } = renderModal();
    typeCode('1234');
    fireEvent.pointerDown(screen.getByTestId('approval-tier3-hold'));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    unmount();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onApprove).not.toHaveBeenCalled();
  });

  it('an action change clears the prior hold state and the code', () => {
    const onApprove = vi.fn();
    const { rerender } = render(
      <TestProviders>
        <ApprovalModal action={tier3Action} onApprove={onApprove} onCancel={vi.fn()} />
      </TestProviders>,
    );
    typeCode('1234');
    fireEvent.pointerDown(screen.getByTestId('approval-tier3-hold'));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    rerender(
      <TestProviders>
        <ApprovalModal action={{ ...tier3Action, action_id: 'a-new' }} onApprove={onApprove} onCancel={vi.fn()} />
      </TestProviders>,
    );
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onApprove).not.toHaveBeenCalled();
    expect(screen.getByTestId('approval-security-code-input')).toHaveValue('');
  });
});

describe('ApprovalModal — closed state', () => {
  it('renders nothing when action is null', () => {
    renderModal({ action: null });
    expect(screen.queryByTestId('approval-modal')).toBeNull();
  });
});
