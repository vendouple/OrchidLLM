/* ==========================================================================
 * OrchidLLM — Booster Pack seed catalogue + shared tag-badge renderer
 * --------------------------------------------------------------------------
 * Loaded as a classic <script> by BOTH users.html and admin.html (before
 * users.js / admin.js) so the admin panel and the user dashboard share one
 * canonical set of demo packs and one tag renderer — guaranteeing feature
 * parity between the admin editor preview and the storefront.
 *
 * Custom tag model (customTag):
 *   name         — text override; falls back to the pack's category label.
 *                  Overriding the label does NOT re-categorise the pack —
 *                  `category` stays authoritative for store filters.
 *   bgStyle      — 'none' | 'solid' | 'gradient' | 'animated'
 *   bgColors     — colors for the bg (1 / 2 / 3 used per style)
 *   borderStyle  — 'none' | 'solid' | 'gradient' | 'animated'
 *                  (undefined = legacy: derive a subtle tint from the bg)
 *   borderColors — independent colors for the border
 *   textStyle    — 'solid' | 'gradient' | 'animated'
 *   textColors   — independent colors for the text
 *   glowing      — bool; glowColor — glow tint (defaults to bgColors[0])
 * ========================================================================== */
(function (global) {
  'use strict';

  const BOOSTER_PACKS_SEED = [
    {
      id: 'bp1',
      name: 'Starter Boost',
      description: 'Perfect for trying out premium models with fast credits.',
      tag: 'POPULAR',
      tagShape: 'flower',
      wallets: [
        { label: 'Standard', credits: 5000, priority: 3, access: 'standard', type: 'standard', color: '#3B82F6' },
        { label: 'Fast', credits: 1000, priority: 4, access: 'premium', type: 'fast', color: '#7C3AED' }
      ],
      priceIDR: 15000,
      priceUSD: 0.99,
      slashPriceIDR: null,
      availableUntil: null,
      globalStock: null,
      purchaseLimit: 2,
      bgStyle: 'solid',
      bgColors: ['#1C1B20'],
      hasBorder: true,
      borderAnimated: false,
      hasGlowing: false,
      category: 'Starter'
    },
    {
      id: 'bp2',
      name: 'Standard Vault',
      description: 'Only standard credits for high-volume background tasks.',
      tag: null,
      tagShape: null,
      wallets: [
        { label: 'Standard', credits: 15000, priority: 2, access: 'standard', type: 'standard', color: '#3B82F6' }
      ],
      priceIDR: 22000,
      priceUSD: 1.49,
      slashPriceIDR: null,
      availableUntil: null,
      globalStock: null,
      purchaseLimit: 5,
      bgStyle: 'solid',
      bgColors: ['#1D1B20'],
      hasBorder: true,
      borderAnimated: false,
      hasGlowing: false,
      category: 'Starter'
    },
    {
      id: 'bp3',
      name: 'Power Pack',
      description: 'Heavy-duty credits for serious API usage. Premium+ access.',
      tag: 'FEATURED',
      tagShape: 'diamond',
      wallets: [
        { label: 'Standard', credits: 30000, priority: 4, access: 'premium', type: 'standard', color: '#EF4444' },
        { label: 'Fast', credits: 5000, priority: 6, access: 'premium+', type: 'fast', color: '#F59E0B' }
      ],
      priceIDR: 45000,
      priceUSD: 2.99,
      slashPriceIDR: null,
      availableUntil: null,
      globalStock: null,
      purchaseLimit: 3,
      bgStyle: 'solid',
      bgColors: ['#18161D'],
      hasBorder: true,
      borderAnimated: true,
      hasGlowing: true,
      glowPulse: true,
      category: 'Sprint Packs'
    },
    {
      id: 'bp4',
      name: 'Fast Lane Boost',
      description: 'Only fast credits with maximum priority for real-time applications.',
      tag: 'ELITE',
      tagShape: 'gem',
      wallets: [
        { label: 'Fast', credits: 8000, priority: 8, access: 'elite', type: 'fast', color: '#EC4899' }
      ],
      priceIDR: 60000,
      priceUSD: 3.99,
      slashPriceIDR: null,
      availableUntil: null,
      globalStock: null,
      purchaseLimit: 1,
      bgStyle: 'gradient',
      bgColors: ['#EC4899', '#7C3AED'],
      hasBorder: true,
      borderAnimated: true,
      hasGlowing: true,
      glowAnimated: true,
      category: 'Sprint Packs'
    },
    {
      id: 'bp5',
      name: 'Surge Pack',
      description: 'Limited-time surge offer with standard and fast credits.',
      tag: 'LIMITED',
      tagShape: 'gem',
      wallets: [
        { label: 'Standard', credits: 8000, priority: 3, access: 'standard', type: 'standard', color: '#8B5CF6' },
        { label: 'Fast', credits: 2000, priority: 5, access: 'premium+', type: 'fast', color: '#06B6D4' }
      ],
      priceIDR: 19999,
      priceUSD: 1.49,
      slashPriceIDR: 35000,
      availableUntil: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(), // 12 hrs left (urgent timer)
      globalStock: null,
      purchaseLimit: 2,
      bgStyle: 'animated',
      bgColors: ['#06B6D4', '#8B5CF6', '#EC4899'],
      hasBorder: true,
      borderAnimated: true,
      hasGlowing: true,
      glowPulse: true,
      category: 'Flash Deals'
    },
    {
      id: 'bp6',
      name: 'Weekend Pass',
      description: 'Promo pack for quick weekend development sprints.',
      tag: 'SALE',
      tagShape: 'burst',
      wallets: [
        { label: 'Standard', credits: 12000, priority: 4, access: 'standard', type: 'standard', color: '#3B82F6' },
        { label: 'Fast', credits: 3000, priority: 4, access: 'premium', type: 'fast', color: '#10B981' }
      ],
      priceIDR: 29999,
      priceUSD: 1.99,
      slashPriceIDR: 48000,
      availableUntil: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days left
      globalStock: null,
      purchaseLimit: 5,
      bgStyle: 'solid',
      bgColors: ['#1C1B20'],
      hasBorder: true,
      borderAnimated: false,
      hasGlowing: false,
      category: 'Flash Deals'
    },
    {
      id: 'bp7',
      name: 'Global Limited Deal',
      description: 'Flash deal with highly limited global quantity.',
      tag: 'SALE',
      tagShape: 'burst',
      wallets: [
        { label: 'Standard', credits: 10000, priority: 5, access: 'premium', type: 'standard', color: '#10B981' },
        { label: 'Fast', credits: 2000, priority: 5, access: 'premium', type: 'fast', color: '#06B6D4' }
      ],
      priceIDR: 15000,
      priceUSD: 0.99,
      slashPriceIDR: 30000,
      availableUntil: null,
      globalStock: 15, // Urgent global stock
      purchaseLimit: null, // Infinite per user
      bgStyle: 'solid',
      bgColors: ['#1A1A1F'],
      hasBorder: true,
      borderAnimated: true,
      hasGlowing: true,
      glowPulse: true,
      category: 'Flash Deals'
    },
    {
      id: 'bp8',
      name: 'Loyalty Special',
      description: 'Personalized Loyalty Deal for long-time Orchid users.',
      tag: null,
      tagShape: null,
      wallets: [
        { label: 'Standard', credits: 50000, priority: 5, access: 'premium+', type: 'standard', color: '#7C3AED' },
        { label: 'Fast', credits: 15000, priority: 7, access: 'elite', type: 'fast', color: '#F59E0B' }
      ],
      priceIDR: 75000,
      priceUSD: 4.99,
      slashPriceIDR: null,
      availableUntil: null,
      globalStock: 250,
      purchaseLimit: 1,
      bgStyle: 'animated',
      bgColors: ['#7C3AED', '#3B82F6', '#8B5CF6'],
      hasBorder: true,
      borderAnimated: true,
      hasGlowing: true,
      glowAnimated: true,
      category: 'Flash Deals',
      personalization: { type: 'tenure_months_gte', value: 6, reason: '6-Month Loyalty Reward' },
    },
    {
      id: 'bp9',
      name: 'VIP Spender Boost',
      description: 'Personalized High Spender Deal for our power users.',
      tag: null,
      tagShape: null,
      wallets: [
        { label: 'Fast', credits: 25000, priority: 8, access: 'elite', type: 'fast', color: '#FFB300' }
      ],
      priceIDR: 99000,
      priceUSD: 6.49,
      slashPriceIDR: null,
      availableUntil: null,
      globalStock: null,
      purchaseLimit: 1,
      bgStyle: 'solid',
      bgColors: ['#1C1921'],
      hasBorder: true,
      borderAnimated: true,
      hasGlowing: true,
      glowPulse: true,
      category: 'Flash Deals',
      personalization: { type: 'spend_gte', value: 1000000, reason: 'VIP Spender Reward' },
    },

    // ── CUSTOMIZATION DEMO PACKS ──────────────────────────────────────────────

    // Demo A: No border, no glow, solid bg — fully minimal
    {
      id: 'cdemo-minimal',
      name: 'Minimal No-Frills',
      description: 'No border, no glow, solid dark bg. Clean and simple.',
      tag: null,
      tagShape: null,
      wallets: [
        { label: 'Standard', credits: 5000, priority: 3, access: 'standard', type: 'standard', color: '#3B82F6' }
      ],
      priceIDR: 15000,
      priceUSD: 0.99,
      slashPriceIDR: null,
      availableUntil: null,
      globalStock: null,
      purchaseLimit: null,
      bgStyle: 'solid',
      bgColors: ['#1A1A1A'],
      hasBorder: false,
      borderAnimated: false,
      hasGlowing: false,
      glowPulse: false,
      glowAnimated: false,
      category: 'Starter'
    },

    // Demo B: Gradient bg, animated border, no glow
    {
      id: 'cdemo-border-ani',
      name: 'Animated Border Pack',
      description: 'Gradient background with a rotating animated border.',
      tag: 'PREMIUM',
      tagShape: 'pill',
      wallets: [
        { label: 'Standard', credits: 8000, priority: 4, access: 'premium', type: 'standard', color: '#8B5CF6' },
        { label: 'Fast', credits: 2000, priority: 6, access: 'premium+', type: 'fast', color: '#F59E0B' }
      ],
      priceIDR: 25000,
      priceUSD: 1.69,
      slashPriceIDR: null,
      availableUntil: null,
      globalStock: null,
      purchaseLimit: null,
      bgStyle: 'gradient',
      bgColors: ['#1E1230', '#2D1B4E'],
      hasBorder: true,
      borderAnimated: true,
      hasGlowing: false,
      glowPulse: false,
      glowAnimated: false,
      category: 'Sprint Packs'
    },

    // Demo C: Animated gradient bg, glowing pulse (no animation)
    {
      id: 'cdemo-glow-pulse',
      name: 'Glow Pulse Style',
      description: 'Animated gradient bg with a pulsing glow effect.',
      tag: 'HOT',
      tagShape: 'burst',
      wallets: [
        { label: 'Fast', credits: 5000, priority: 7, access: 'premium+', type: 'fast', color: '#EF4444' }
      ],
      priceIDR: 30000,
      priceUSD: 1.99,
      slashPriceIDR: 45000,
      availableUntil: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      globalStock: null,
      purchaseLimit: 3,
      bgStyle: 'animated',
      bgColors: ['#EF4444', '#F97316', '#FBBF24'],
      hasBorder: true,
      borderAnimated: false,
      hasGlowing: true,
      glowPulse: true,
      glowAnimated: false,
      category: 'Flash Deals'
    },

    // Demo D: Solid bg, no border, rotating glow
    {
      id: 'cdemo-glow-rotate',
      name: 'Rotating Glow Style',
      description: 'Solid bg with a rotating glow animation that moves around the card.',
      tag: 'ELITE',
      tagShape: 'gem',
      wallets: [
        { label: 'Fast', credits: 10000, priority: 8, access: 'elite', type: 'fast', color: '#EC4899' },
        { label: 'Standard', credits: 20000, priority: 4, access: 'premium+', type: 'standard', color: '#9333EA' }
      ],
      priceIDR: 75000,
      priceUSD: 4.99,
      slashPriceIDR: null,
      availableUntil: null,
      globalStock: 20,
      purchaseLimit: 1,
      bgStyle: 'solid',
      bgColors: ['#1A0A20'],
      themeColor: '#D946EF',
      hasBorder: false,
      borderAnimated: false,
      hasGlowing: true,
      glowPulse: false,
      glowAnimated: true,
      category: 'Sprint Packs'
    },

    // Demo E: Everything on — animated bg, animated border, rotating glow
    {
      id: 'cdemo-maxed',
      name: 'All Effects Maxed',
      description: 'Animated gradient bg + animated border + rotating glow — all enabled.',
      tag: 'MAXED OUT',
      tagShape: 'burst',
      wallets: [
        { label: 'Standard', credits: 25000, priority: 5, access: 'premium+', type: 'standard', color: '#06B6D4' },
        { label: 'Fast', credits: 5000, priority: 8, access: 'elite', type: 'fast', color: '#F59E0B' }
      ],
      priceIDR: 59999,
      priceUSD: 3.99,
      slashPriceIDR: 89999,
      availableUntil: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      globalStock: 8,
      purchaseLimit: 1,
      bgStyle: 'animated',
      bgColors: ['#06B6D4', '#8B5CF6', '#EC4899'],
      hasBorder: true,
      borderAnimated: true,
      hasGlowing: true,
      glowPulse: false,
      glowAnimated: true,
      category: 'Sprint Packs'
    },

    // Demo F: Discount showcase
    {
      id: 'cdemo-discount',
      name: 'Big Discount Pack',
      description: 'Showing a 50% discount badge without using any shape component.',
      tag: 'SALE',
      tagShape: 'pill',
      wallets: [
        { label: 'Standard', credits: 10000, priority: 3, access: 'standard', type: 'standard', color: '#10B981' }
      ],
      priceIDR: 10000,
      priceUSD: 0.69,
      slashPriceIDR: 20000,
      availableUntil: null,
      globalStock: null,
      purchaseLimit: null,
      bgStyle: 'gradient',
      bgColors: ['#052e16', '#166534'],
      hasBorder: true,
      borderAnimated: false,
      hasGlowing: false,
      glowPulse: false,
      glowAnimated: false,
      category: 'Flash Deals'
    },

    // ── PERSONALIZATION DEMO PACKS ────────────────────────────────────────────

    // Personalization A: Spent threshold
    {
      id: 'pdemo-spent',
      name: 'Big Spender Deal',
      description: 'Visible only if total spend exceeds 1,000,000 IDR.',
      tag: 'EXCLUSIVE',
      tagShape: 'burst',
      wallets: [
        { label: 'Fast', credits: 15000, priority: 8, access: 'elite', type: 'fast', color: '#FFD700' }
      ],
      priceIDR: 80000,
      priceUSD: 5.29,
      slashPriceIDR: null,
      availableUntil: null,
      globalStock: null,
      purchaseLimit: 1,
      bgStyle: 'gradient',
      bgColors: ['#2D1B00', '#4A3000'],
      hasBorder: true,
      borderAnimated: true,
      hasGlowing: true,
      glowPulse: true,
      glowAnimated: false,
      category: 'Sprint Packs',
      personalization: { type: 'spend_gte', value: 1000000, reason: 'Big Spender Reward' },
    },

    // Personalization B: Tenure (months)
    {
      id: 'pdemo-tenure',
      name: 'Loyalty Milestone',
      description: 'Shows up after 3+ months on the platform.',
      tag: null,
      tagShape: null,
      wallets: [
        { label: 'Standard', credits: 30000, priority: 4, access: 'premium+', type: 'standard', color: '#8B5CF6' }
      ],
      priceIDR: 45000,
      priceUSD: 2.99,
      slashPriceIDR: null,
      availableUntil: null,
      globalStock: null,
      purchaseLimit: 1,
      bgStyle: 'solid',
      bgColors: ['#1A1A2E'],
      hasBorder: true,
      borderAnimated: false,
      hasGlowing: false,
      glowPulse: false,
      glowAnimated: false,
      category: 'Starter',
      personalization: { type: 'tenure_months_gte', value: 3, reason: '3-Month Loyalty Reward' },
    },

    // Personalization C: Recent spend
    {
      id: 'pdemo-recent-spend',
      name: 'Active User Boost',
      description: 'Available if you spent over 100k in the past month.',
      tag: 'ACTIVE',
      tagShape: 'pill',
      wallets: [
        { label: 'Fast', credits: 5000, priority: 6, access: 'premium', type: 'fast', color: '#10B981' },
        { label: 'Standard', credits: 10000, priority: 3, access: 'standard', type: 'standard', color: '#3B82F6' }
      ],
      priceIDR: 25000,
      priceUSD: 1.69,
      slashPriceIDR: null,
      availableUntil: null,
      globalStock: null,
      purchaseLimit: 3,
      bgStyle: 'gradient',
      bgColors: ['#052e16', '#166534'],
      hasBorder: true,
      borderAnimated: false,
      hasGlowing: false,
      glowPulse: false,
      glowAnimated: false,
      category: 'Sprint Packs',
      personalization: { type: 'recent_spend_gte', value: 100000, reason: 'Active User Reward' },
    },

    // Personalization D: Low recent spend — win-back
    {
      id: 'pdemo-winback',
      name: 'We Miss You Deal',
      description: 'If you spent less than 50k in the past month.',
      tag: 'COME BACK',
      tagShape: 'pill',
      wallets: [
        { label: 'Standard', credits: 8000, priority: 3, access: 'standard', type: 'standard', color: '#F97316' }
      ],
      priceIDR: 10000,
      priceUSD: 0.69,
      slashPriceIDR: null,
      availableUntil: null,
      globalStock: null,
      purchaseLimit: 2,
      bgStyle: 'solid',
      bgColors: ['#1C1200'],
      hasBorder: true,
      borderAnimated: false,
      hasGlowing: false,
      glowPulse: false,
      glowAnimated: false,
      category: 'Flash Deals',
      personalization: { type: 'recent_spend_lt', value: 50000, reason: 'Win-Back Offer' },
    },

    // Personalization E: Plan tenure + specific plan
    {
      id: 'pdemo-plan-tenure',
      name: 'Plan Anniversary Pack',
      description: 'Unlocked after 2+ months on your current plan.',
      tag: 'ANNIVERSARY',
      tagShape: 'gem',
      wallets: [
        { label: 'Fast', credits: 12000, priority: 7, access: 'premium+', type: 'fast', color: '#EC4899' },
        { label: 'Standard', credits: 25000, priority: 4, access: 'premium+', type: 'standard', color: '#A855F7' }
      ],
      priceIDR: 65000,
      priceUSD: 4.29,
      slashPriceIDR: null,
      availableUntil: null,
      globalStock: null,
      purchaseLimit: 1,
      bgStyle: 'animated',
      bgColors: ['#EC4899', '#A855F7', '#6366F1'],
      hasBorder: true,
      borderAnimated: true,
      hasGlowing: true,
      glowPulse: false,
      glowAnimated: true,
      category: 'Sprint Packs',
      personalization: { type: 'plan_tenure_gte', value: 2, reason: 'Plan Anniversary Reward' },
    },

    // Personalization F: Activity-based
    {
      id: 'pdemo-active',
      name: 'Power User Special',
      description: 'Only for highly active users making 50+ requests today.',
      tag: 'POWER USER',
      tagShape: 'burst',
      wallets: [
        { label: 'Fast', credits: 30000, priority: 8, access: 'elite', type: 'fast', color: '#FFB300' }
      ],
      priceIDR: 99000,
      priceUSD: 6.49,
      slashPriceIDR: null,
      availableUntil: null,
      globalStock: null,
      purchaseLimit: 1,
      bgStyle: 'gradient',
      bgColors: ['#1C1400', '#3D2800'],
      hasBorder: true,
      borderAnimated: true,
      hasGlowing: true,
      glowPulse: true,
      glowAnimated: false,
      category: 'Sprint Packs',
      personalization: { type: 'activity_gte', value: 50, reason: 'Power User Reward' },
    },
    {
      id: 'cdemo-custom-1',
      name: 'Animated Tag Showcase',
      description: 'A booster pack displaying a custom tag with an animated gradient background and animated text colors.',
      tag: null,
      tagShape: null,
      wallets: [
        { label: 'Fast', credits: 15000, priority: 7, access: 'premium+', type: 'fast', color: '#06B6D4' }
      ],
      priceIDR: 45000,
      priceUSD: 2.99,
      slashPriceIDR: 90000,
      availableUntil: null,
      globalStock: null,
      purchaseLimit: null,
      bgStyle: 'solid',
      bgColors: ['#1E1B24'],
      hasBorder: true,
      borderAnimated: true,
      hasGlowing: true,
      glowPulse: true,
      category: 'Sprint Packs',
      customTag: {
        name: 'DYNAMIC SPEED',
        bgStyle: 'animated',
        bgColors: ['#06b6d4', '#8b5cf6', '#ec4899'],
        textStyle: 'animated',
        textColors: ['#ffff00', '#ffffff', '#00ffff'],
        glowing: true,
        glowColor: 'rgba(139, 92, 246, 0.6)'
      }
    },
    {
      id: 'cdemo-custom-2',
      name: 'Glowing Tag Showcase',
      description: 'A booster pack displaying a custom tag with a solid red background and a high-intensity red glow.',
      tag: null,
      tagShape: null,
      wallets: [
        { label: 'Standard', credits: 10000, priority: 3, access: 'standard', type: 'standard', color: '#10B981' }
      ],
      priceIDR: 20000,
      priceUSD: 1.49,
      slashPriceIDR: null,
      availableUntil: null,
      globalStock: 10,
      purchaseLimit: 1,
      bgStyle: 'solid',
      bgColors: ['#1C1B20'],
      hasBorder: true,
      borderAnimated: false,
      hasGlowing: false,
      category: 'Flash Deals',
      customTag: {
        name: 'VIP DEAL',
        bgStyle: 'solid',
        bgColors: ['#ef4444'],
        textStyle: 'solid',
        textColors: ['#ffffff'],
        glowing: true,
        glowColor: 'rgba(239, 68, 68, 0.85)'
      }
    },
    {
      id: 'cdemo-custom-3',
      name: 'Gradient Tag Showcase',
      description: 'A booster pack displaying a custom tag with a solid background and a custom gradient text color.',
      tag: null,
      tagShape: null,
      wallets: [
        { label: 'Standard', credits: 5000, priority: 3, access: 'standard', type: 'standard', color: '#3B82F6' }
      ],
      priceIDR: 15000,
      priceUSD: 0.99,
      slashPriceIDR: null,
      availableUntil: null,
      globalStock: null,
      purchaseLimit: null,
      bgStyle: 'solid',
      bgColors: ['#1E1B24'],
      hasBorder: true,
      borderAnimated: false,
      hasGlowing: false,
      category: 'Starter',
      customTag: {
        name: 'STARTER PACK',
        bgStyle: 'solid',
        bgColors: ['#272530'],
        textStyle: 'gradient',
        textColors: ['#f59e0b', '#ffd700'],
        glowing: false
      }
    }
  ];

  // Shared "custom tag" badge renderer — one implementation for the booster
  // store, the plan cards AND the admin dialog live preview.
  function renderTagBadge(customTag, fallbackName, fallbackClass) {
    const tagName = (customTag && customTag.name) || fallbackName;
    if (!tagName) return '';

    let inlineStyle = '';
    let badgeClass = 'booster-header-tag-badge ' + (fallbackClass || '');
    let textStyle = '';
    let textClass = 'tag-badge-text';

    if (customTag) {
      const bg = customTag.bgStyle || 'solid';
      const bgColors = (customTag.bgColors && customTag.bgColors.length) ? customTag.bgColors : ['#7C3AED'];
      const borderStyle = customTag.borderStyle; // undefined = legacy derive
      const borderColors = (customTag.borderColors && customTag.borderColors.length) ? customTag.borderColors : [];

      if (bg === 'animated') badgeClass += ' tag-bg-animated';

      if (borderStyle === 'gradient' || borderStyle === 'animated') {
        // Gradient border via the two-layer background technique — the bg
        // gradient paints the padding-box, the border gradient the border-box.
        const bgLayer = bg === 'none' ? 'linear-gradient(transparent, transparent)'
          : bg === 'solid' ? ('linear-gradient(' + bgColors[0] + ', ' + bgColors[0] + ')')
          : ('linear-gradient(135deg, ' + bgColors.join(', ') + ')');
        const bcs = borderColors.length ? borderColors : ['#ffffff', '#7C3AED'];
        inlineStyle += 'border: 1px solid transparent; background: ' + bgLayer + ' padding-box, linear-gradient(135deg, ' + bcs.join(', ') + ') border-box;';
        if (borderStyle === 'animated') badgeClass += ' tag-border-animated';
      } else {
        if (bg === 'none') inlineStyle += 'background: transparent;';
        else if (bg === 'solid') inlineStyle += 'background: ' + bgColors[0] + ';';
        else inlineStyle += 'background: linear-gradient(135deg, ' + bgColors.join(', ') + ');';

        if (borderStyle === 'none') {
          inlineStyle += 'border: none;';
        } else if (borderStyle === 'solid') {
          inlineStyle += 'border-color: ' + (borderColors[0] || 'rgba(255,255,255,0.2)') + ';';
        } else {
          // Legacy tags (no explicit borderStyle) keep the original derived tint.
          if (bg === 'solid') inlineStyle += 'border-color: color-mix(in srgb, ' + bgColors[0] + ' 40%, transparent);';
          else if (bg === 'gradient') inlineStyle += 'border-color: rgba(255,255,255,0.15);';
          else if (bg === 'animated') inlineStyle += 'border-color: rgba(255,255,255,0.2);';
        }
      }

      if (customTag.glowing) {
        inlineStyle += 'box-shadow: 0 0 10px ' + (customTag.glowColor || bgColors[0]) + ';';
      }

      const textStyleType = customTag.textStyle || 'solid';
      const textColors = (customTag.textColors && customTag.textColors.length) ? customTag.textColors : ['#FFFFFF'];
      if (textStyleType === 'solid') {
        inlineStyle += 'color: ' + textColors[0] + ';';
      } else if (textStyleType === 'gradient') {
        textStyle += 'background: linear-gradient(90deg, ' + textColors[0] + ', ' + (textColors[1] || textColors[0]) + '); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; display: inline-block;';
      } else if (textStyleType === 'animated') {
        textClass += ' tag-text-animated';
        textStyle += 'background: linear-gradient(90deg, ' + textColors.join(', ') + '); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; display: inline-block;';
      }
    }

    return '<span class="' + badgeClass + '" style="' + inlineStyle + '"><span class="' + textClass + '" style="' + textStyle + '">' + tagName + '</span></span>';
  }

  global.ORCHID_BOOSTER_SEED = BOOSTER_PACKS_SEED;
  global.OrchidTagBadge = renderTagBadge;
})(window);
