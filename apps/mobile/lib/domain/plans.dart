// Subscription tiers — mirrors docs/aethersky/PLAN.md §8. Entitlements will come from
// RevenueCat; this table drives the paywall and feature gates.

enum Tier { free, pro, elite }

class PlanFeature {
  const PlanFeature(this.zh, this.en, this.minTier, {this.note});

  final String zh;
  final String en;
  final Tier minTier;
  final String? note; // e.g. what Free gets when Pro gets more
}

const planFeatures = <PlanFeature>[
  PlanFeature('無限航班追蹤、即時狀態、地圖', 'Unlimited flight tracking, live status, map', Tier.free),
  PlanFeature('延誤、登機門、取消推播', 'Delay, gate and cancellation alerts', Tier.free),
  PlanFeature('Live Activity／Android Live Updates／小工具', 'Live Activities, Android Live Updates, widgets', Tier.free),
  PlanFeature('飛行紀錄與統計（無限歷史）', 'Flight history & stats (unlimited)', Tier.free),
  PlanFeature('Email 轉寄匯入、朋友分享', 'E-mail import, share with friends', Tier.free),
  PlanFeature('票價追蹤（固定日期 ×5）', 'Fare trackers (5, exact dates)', Tier.free),
  PlanFeature('無限票價追蹤＋彈性日期', 'Unlimited trackers + flexible dates', Tier.pro),
  PlanFeature('提前延誤預警、inbound 飛機、轉機助理', 'Early delay warnings, inbound aircraft, connection assistant', Tier.pro),
  PlanFeature('貴賓室「我能進嗎」與評價', 'Lounge access check & reviews', Tier.pro),
  PlanFeature('里程兌換位提醒', 'Award seat alerts', Tier.elite),
  PlanFeature('會員等級進度與到期提醒', 'Elite status progress & expiry alerts', Tier.elite),
  PlanFeature('快速通關／貴賓室折扣、賠償申請協助', 'Fast-track & lounge discounts, compensation claims', Tier.elite),
  PlanFeature('AI 旅行助理（無限）', 'AI travel assistant (unlimited)', Tier.elite),
];

class PlanPrice {
  const PlanPrice(this.tier, this.monthlyUsd, this.yearlyUsd, this.yearlyTwd);

  final Tier tier;
  final double? monthlyUsd;
  final double yearlyUsd;
  final int yearlyTwd;
}

const planPrices = <PlanPrice>[
  PlanPrice(Tier.pro, 6.99, 49.99, 1590),
  PlanPrice(Tier.elite, 14.99, 119.99, 3790),
];

bool includes(Tier have, Tier need) => have.index >= need.index;
