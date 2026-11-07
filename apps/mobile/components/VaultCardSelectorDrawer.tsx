import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SwipeDownDrawer, DrawerScrollView } from './SwipeDownDrawer';
import { CreditCard, Layers, Check, CornerDownRight } from 'lucide-react-native';
import { CedarColors, CedarTypography } from '@credics/core';
import { buildHierarchicalCardList, HierarchicalCardItem, BaseCardItem } from '../lib/cardStore';

interface VaultCardSelectorDrawerProps {
  visible: boolean;
  onClose: () => void;
  cards: BaseCardItem[];
  selectedCardId: string;
  onSelectCard: (cardId: string) => void;
  title?: string;
}

export const VaultCardSelectorDrawer: React.FC<VaultCardSelectorDrawerProps> = ({
  visible,
  onClose,
  cards,
  selectedCardId,
  onSelectCard,
  title = 'Select Vault Card',
}) => {
  const hierarchicalCards = useMemo(() => {
    return buildHierarchicalCardList(cards);
  }, [cards]);

  const totalMasterLimit = useMemo(() => {
    return cards
      .filter((c) => c.is_primary || !c.parent_card_id)
      .reduce((sum, c) => sum + Number(c.total_limit || 0), 0);
  }, [cards]);

  const handleSelect = (id: string) => {
    onSelectCard(id);
    onClose();
  };

  return (
    <SwipeDownDrawer
      visible={visible}
      onClose={onClose}
      title={title}
      subtitle="Filter transactions by individual card while viewing shared family limit"
      heightPercent={0.75}
    >
      <DrawerScrollView contentContainerStyle={styles.scrollContent}>
        {/* Unified All Cards Option */}
        <TouchableOpacity
          activeOpacity={0.7}
          style={[
            styles.cardOption,
            selectedCardId === 'all' && styles.cardOptionSelected,
          ]}
          onPress={() => handleSelect('all')}
        >
          <View style={[styles.iconBox, selectedCardId === 'all' && styles.iconBoxSelected]}>
            <Layers size={18} color={selectedCardId === 'all' ? '#10B981' : '#94A3B8'} />
          </View>
          <View style={styles.cardInfo}>
            <View style={styles.nameRow}>
              <Text style={[styles.cardName, selectedCardId === 'all' && styles.cardNameSelected]}>
                All Vault Cards
              </Text>
              <View style={styles.unifiedBadge}>
                <Text style={styles.unifiedBadgeText}>Unified</Text>
              </View>
            </View>
            <Text style={styles.cardSub}>
              Combined Master Limit: ₹{totalMasterLimit.toLocaleString('en-IN')}
            </Text>
          </View>
          {selectedCardId === 'all' && (
            <View style={styles.checkIcon}>
              <Check size={16} color="#10B981" />
            </View>
          )}
        </TouchableOpacity>

        {/* Hierarchical Cards List */}
        {hierarchicalCards.map((card: HierarchicalCardItem) => {
          const isSelected = selectedCardId === card.id;

          if (card.isSub) {
            // Secondary / Add-on Card (Indented with Arrow)
            return (
              <TouchableOpacity
                key={card.id}
                activeOpacity={0.7}
                style={[
                  styles.cardOption,
                  styles.subCardOption,
                  isSelected && styles.cardOptionSelected,
                ]}
                onPress={() => handleSelect(card.id)}
              >
                <View style={styles.subArrowBox}>
                  <CornerDownRight size={14} color="#6EE7B7" />
                </View>
                <View style={[styles.iconBox, styles.subIconBox, isSelected && styles.iconBoxSelected]}>
                  <CreditCard size={15} color={isSelected ? '#10B981' : '#6EE7B7'} />
                </View>
                <View style={styles.cardInfo}>
                  <View style={styles.nameRow}>
                    <Text
                      style={[styles.cardName, styles.subCardName, isSelected && styles.cardNameSelected]}
                      numberOfLines={1}
                    >
                      {card.card_name}
                    </Text>
                    <View style={styles.subBadge}>
                      <Text style={styles.subBadgeText}>Sub</Text>
                    </View>
                  </View>
                  <Text style={styles.cardSub}>
                    •••• {card.last_4_digits || '••••'} • Shared Limit: ₹
                    {Number(card.parentCard?.total_limit || card.total_limit || 0).toLocaleString('en-IN')}
                  </Text>
                </View>
                {isSelected && (
                  <View style={styles.checkIcon}>
                    <Check size={16} color="#10B981" />
                  </View>
                )}
              </TouchableOpacity>
            );
          }

          // Primary Card
          return (
            <TouchableOpacity
              key={card.id}
              activeOpacity={0.7}
              style={[
                styles.cardOption,
                isSelected && styles.cardOptionSelected,
              ]}
              onPress={() => handleSelect(card.id)}
            >
              <View style={[styles.iconBox, isSelected && styles.iconBoxSelected]}>
                <CreditCard size={18} color={isSelected ? '#10B981' : '#10B981'} />
              </View>
              <View style={styles.cardInfo}>
                <View style={styles.nameRow}>
                  <Text
                    style={[styles.cardName, isSelected && styles.cardNameSelected]}
                    numberOfLines={1}
                  >
                    {card.card_name}
                  </Text>
                  {!!card.subCardsCount && card.subCardsCount > 0 && (
                    <View style={styles.familyBadge}>
                      <Text style={styles.familyBadgeText}>+{card.subCardsCount} Sub</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.cardSub}>
                  •••• {card.last_4_digits || '••••'} • Limit: ₹
                  {Number(card.total_limit || 0).toLocaleString('en-IN')}
                </Text>
              </View>
              {isSelected && (
                <View style={styles.checkIcon}>
                  <Check size={16} color="#10B981" />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </DrawerScrollView>
    </SwipeDownDrawer>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
    gap: 8,
  },
  cardOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
  },
  subCardOption: {
    marginLeft: 18,
    paddingLeft: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.015)',
    borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  cardOptionSelected: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  subArrowBox: {
    marginRight: 6,
    opacity: 0.8,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  subIconBox: {
    width: 32,
    height: 32,
    backgroundColor: 'rgba(16, 185, 129, 0.06)',
  },
  iconBoxSelected: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  cardInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
    flexShrink: 1,
  },
  subCardName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E2E8F0',
  },
  cardNameSelected: {
    color: '#10B981',
  },
  cardSub: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
    fontWeight: '500',
  },
  unifiedBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
  },
  unifiedBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
  familyBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  familyBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#10B981',
  },
  subBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
    backgroundColor: 'rgba(110, 231, 183, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(110, 231, 183, 0.2)',
  },
  subBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#6EE7B7',
    textTransform: 'uppercase',
  },
  checkIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
});
