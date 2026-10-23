import { OrderDto } from '../types/order.types.js';
import { TrackingOrderDto } from '../types/tracking.types.js';
import { OrderStatus } from '../constants/order-status.js';

export interface OrderTimerState {
  status: OrderStatus;
  isPlaced: boolean;
  isPreparing: boolean;
  isPrepared: boolean;
  isCompleted: boolean;
  isCancelled: boolean;
  initialEstimatedMinutes: number;
  totalEstimatedMinutes: number;
  adjustmentsMinutesTotal: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  isOverdue: boolean;
  overdueSeconds: number;
  progressPercentage: number;
  formattedElapsed: string;
  formattedRemaining: string;
}

const formatSeconds = (totalSeconds: number): string => {
  const abs = Math.abs(totalSeconds);
  const minutes = Math.floor(abs / 60);
  const seconds = abs % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

/**
 * Pure function to calculate authoritative timer state from server timestamps.
 * Guarantees zero timer drift and seamless reconstruction on refresh/reconnect.
 */
export const calculateOrderTimer = (
  order: OrderDto | TrackingOrderDto,
  nowMs: number = Date.now()
): OrderTimerState => {
  const status = order.status;
  const isPlaced = status === OrderStatus.PLACED;
  const isPreparing = status === OrderStatus.PREPARING;
  const isPrepared = status === OrderStatus.PREPARED;
  const isCompleted = status === OrderStatus.COMPLETED;
  const isCancelled = status === OrderStatus.CANCELLED;

  const initialEstimatedMinutes = order.initialEstimatedMinutes || 10;
  const adjustmentsMinutesTotal = (order.prepAdjustments || []).reduce(
    (sum, adj) => sum + adj.minutesAdded,
    0
  );
  const totalEstimatedMinutes = initialEstimatedMinutes + adjustmentsMinutesTotal;

  // 1. PLACED: Not yet started cooking
  if (isPlaced) {
    return {
      status,
      isPlaced: true,
      isPreparing: false,
      isPrepared: false,
      isCompleted: false,
      isCancelled: false,
      initialEstimatedMinutes,
      totalEstimatedMinutes,
      adjustmentsMinutesTotal,
      elapsedSeconds: 0,
      remainingSeconds: totalEstimatedMinutes * 60,
      isOverdue: false,
      overdueSeconds: 0,
      progressPercentage: 0,
      formattedElapsed: '00:00',
      formattedRemaining: `${totalEstimatedMinutes}m est.`
    };
  }

  // 2. PREPARING: Cooking in progress
  if (isPreparing && order.preparationStartedAt) {
    const startedAtMs = new Date(order.preparationStartedAt).getTime();
    const elapsedSeconds = Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));

    const targetCompletionMs = order.estimatedCompletionAt
      ? new Date(order.estimatedCompletionAt).getTime()
      : startedAtMs + totalEstimatedMinutes * 60 * 1000;

    const remainingSeconds = Math.floor((targetCompletionMs - nowMs) / 1000);
    const isOverdue = remainingSeconds < 0;
    const overdueSeconds = isOverdue ? Math.abs(remainingSeconds) : 0;

    const totalDurationSeconds = Math.max(1, Math.floor((targetCompletionMs - startedAtMs) / 1000));
    const progressPercentage = Math.min(
      100,
      Math.max(0, Math.round((elapsedSeconds / totalDurationSeconds) * 100))
    );

    const formattedElapsed = formatSeconds(elapsedSeconds);
    const formattedRemaining = isOverdue
      ? `+${formatSeconds(overdueSeconds)} overdue`
      : `${formatSeconds(remainingSeconds)} left`;

    return {
      status,
      isPlaced: false,
      isPreparing: true,
      isPrepared: false,
      isCompleted: false,
      isCancelled: false,
      initialEstimatedMinutes,
      totalEstimatedMinutes,
      adjustmentsMinutesTotal,
      elapsedSeconds,
      remainingSeconds,
      isOverdue,
      overdueSeconds,
      progressPercentage,
      formattedElapsed,
      formattedRemaining
    };
  }

  // 3. PREPARED, COMPLETED, or CANCELLED
  let actualPrepSeconds = 0;
  if (order.preparationStartedAt && (order.preparedAt || order.completedAt)) {
    const startedAtMs = new Date(order.preparationStartedAt).getTime();
    const finishedAtMs = new Date(order.preparedAt || order.completedAt!).getTime();
    actualPrepSeconds = Math.max(0, Math.floor((finishedAtMs - startedAtMs) / 1000));
  }

  return {
    status,
    isPlaced: false,
    isPreparing: false,
    isPrepared,
    isCompleted,
    isCancelled,
    initialEstimatedMinutes,
    totalEstimatedMinutes,
    adjustmentsMinutesTotal,
    elapsedSeconds: actualPrepSeconds,
    remainingSeconds: 0,
    isOverdue: false,
    overdueSeconds: 0,
    progressPercentage: 100,
    formattedElapsed: formatSeconds(actualPrepSeconds),
    formattedRemaining: isPrepared ? 'Ready for pickup' : (isCompleted ? 'Handed over' : 'Cancelled')
  };
};
