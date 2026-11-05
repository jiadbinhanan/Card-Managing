import { CardData, CardLimitSummary, CardLimitStat } from '../types';

/**
 * Returns all card IDs belonging to the family of the selected card.
 * If selectedCardId is 'all', returns all card IDs.
 */
export function getFamilyCardIds(selectedCardId: string, cards: CardData[]): string[] {
  if (selectedCardId === 'all') {
    return cards.map((c) => c.id);
  }
  const selected = cards.find((c) => c.id === selectedCardId);
  if (!selected) return [];

  const primaryId = selected.is_primary ? selected.id : (selected.parent_card_id || selected.id);
  const family = cards.filter((c) => c.id === primaryId || c.parent_card_id === primaryId);
  return family.map((c) => c.id);
}

/**
 * Calculates master limit based on whether 'all' or a specific card is selected.
 */
export function calculateTotalLimit(selectedCardId: string, cards: CardData[]): number {
  if (selectedCardId === 'all') {
    const primaryLimit = cards
      .filter((c) => c.is_primary)
      .reduce((sum, c) => sum + Number(c.total_limit || 0), 0);
    return primaryLimit > 0 ? primaryLimit : 180000;
  }
  const selected = cards.find((c) => c.id === selectedCardId);
  if (!selected) return 0;

  const primaryId = selected.is_primary ? selected.id : (selected.parent_card_id || selected.id);
  const primaryCard = cards.find((c) => c.id === primaryId);
  return primaryCard ? Number(primaryCard.total_limit || 0) : Number(selected.total_limit || 0);
}

/**
 * Core mathematical formula for Available Limit, Utilized Limit, and Utilization ratios.
 * Available = TotalLimit - Withdrawals - CCSpends + BillPayments
 */
export function calculateCardLimits(params: {
  totalLimit: number;
  transactions: Array<{
    amount: number;
    type: string;
    status: string;
    qr_id?: string | null;
    settled_to_user?: string | null;
    remarks?: string | null;
    settlement_details?: any | null;
  }>;
  spends: Array<{ amount: number; payment_method: string }>;
}): CardLimitSummary {
  const { totalLimit, transactions, spends } = params;

  const withdrawals = transactions
    .filter((t) => {
      if (t.type !== 'withdrawal') return false;
      const isRotation = t.qr_id || t.settled_to_user || (t.remarks || '').toLowerCase().includes('rotation');
      if (isRotation) return true;
      return t.status === 'pending_settlement' || t.status === 'partially_settled';
    })
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const billPayments = transactions
    .filter((t) => t.type === 'bill_payment')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const ccSpends = spends
    .filter((s) => s.payment_method === 'credit_card')
    .reduce((sum, s) => sum + Number(s.amount || 0), 0);

  const inTransitAmount = transactions
    .filter((t) => {
      if (t.type !== 'withdrawal') return false;
      const isRotation = t.qr_id || (t.remarks || '').toLowerCase().includes('rotation');
      return isRotation && t.status !== 'settled';
    })
    .reduce((sum, t) => {
      const due =
        t.status === 'partially_settled' && t.settlement_details?.total_due !== undefined
          ? Number(t.settlement_details.total_due)
          : Number(t.amount || 0);
      return sum + due;
    }, 0);

  const availableLimit = Math.max(0, totalLimit - withdrawals - ccSpends + billPayments);
  const utilizedLimit = Math.max(0, totalLimit - availableLimit);

  const availablePercentage = totalLimit > 0
    ? Math.max(0, Math.min(100, Math.round((availableLimit / totalLimit) * 100)))
    : 0;

  const utilizationPercentage = totalLimit > 0
    ? Math.max(0, Math.min(100, 100 - availablePercentage))
    : 0;

  return {
    totalLimit,
    availableLimit,
    utilizedLimit,
    availablePercentage,
    utilizationPercentage,
    inTransitAmount,
  };
}

/**
 * Resolves available limit map across all cards based on Card Family sharing.
 */
export function calculateCardAvailableMap(
  cards: CardData[],
  allTxs: Array<{
    amount: number;
    type: string;
    card_id?: string | null;
    status: string;
    qr_id?: string | null;
    settled_to_user?: string | null;
    remarks?: string | null;
  }>,
  allSpends: Array<{ amount: number; payment_method: string; card_id?: string | null }>
): Record<string, number> {
  const map: Record<string, number> = {};
  const primaryCards = cards.filter((c) => c.is_primary || !c.parent_card_id);

  primaryCards.forEach((primaryCard) => {
    const familyCards = cards.filter((c) => c.id === primaryCard.id || c.parent_card_id === primaryCard.id);
    const familyCardIds = familyCards.map((c) => c.id);
    const primaryLimit = Number(primaryCard.total_limit || 0);

    const familyTxs = allTxs.filter((t) => t.card_id && familyCardIds.includes(t.card_id));
    const familySpends = allSpends.filter((s) => s.card_id && familyCardIds.includes(s.card_id));

    const metrics = calculateCardLimits({
      totalLimit: primaryLimit,
      transactions: familyTxs,
      spends: familySpends,
    });

    familyCards.forEach((c) => {
      map[c.id] = metrics.availableLimit;
    });
  });

  return map;
}

/**
 * Computes Card Family Limit Stats for Hero Chart & Card Selector.
 */
export function calculateCardLimitStats(params: {
  cards: CardData[];
  transactions: any[];
  spends: any[];
}): CardLimitStat[] {
  const { cards, transactions, spends } = params;
  const primaryCards = cards.filter((c) => c.is_primary || !c.parent_card_id);
  const orphanSubCards = cards.filter(
    (c) => !c.is_primary && c.parent_card_id && !primaryCards.some((p) => p.id === c.parent_card_id)
  );
  const familyRoots = [...primaryCards, ...orphanSubCards];

  return familyRoots.map((rootCard) => {
    const subCards = cards.filter((c) => c.parent_card_id === rootCard.id);
    const familyCardIds = [rootCard.id, ...subCards.map((s) => s.id)];
    const cardLimit = Number(rootCard.total_limit || 0);

    const familyTxs = transactions.filter((t) => t.card_id && familyCardIds.includes(t.card_id));
    const familySpends = spends.filter((s) => s.card_id && familyCardIds.includes(s.card_id));

    const metrics = calculateCardLimits({
      totalLimit: cardLimit,
      transactions: familyTxs,
      spends: familySpends,
    });

    const ratio = cardLimit > 0 ? metrics.utilizedLimit / cardLimit : 0;

    return {
      id: rootCard.id,
      name: rootCard.card_name,
      last4: rootCard.last_4_digits,
      hasSubCards: subCards.length > 0,
      subCardsCount: subCards.length,
      subCardsLast4: subCards.map((s) => s.last_4_digits),
      totalLimit: cardLimit,
      usedLimit: metrics.utilizedLimit,
      availableLimit: metrics.availableLimit,
      utilizationRatio: ratio,
    };
  });
}

/**
 * Calculates personal user due from personal credit card spends vs own-pocket repayments.
 */
export function calculatePersonalDue(
  userId: string,
  allSpends: Array<{ user_id: string; amount: number; payment_method: string }>,
  allTxs: Array<{ recorded_by: string; amount: number; type: string; payment_method?: string | null }>
): number {
  const personalSpends = allSpends
    .filter(
      (s) =>
        s.user_id === userId &&
        ['credit_card', 'from_card_limit', 'lent_recovery'].includes(s.payment_method)
    )
    .reduce((sum, s) => sum + Number(s.amount || 0), 0);

  const ownPocketRepayments = allTxs
    .filter(
      (t) =>
        t.recorded_by === userId &&
        t.type === 'bill_payment' &&
        t.payment_method === 'own_pocket'
    )
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  return Math.max(0, personalSpends - ownPocketRepayments);
}
