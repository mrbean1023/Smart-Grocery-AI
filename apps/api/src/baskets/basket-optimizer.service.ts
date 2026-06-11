import { Injectable } from '@nestjs/common';
import type { BasketStrategy, OptimizationResult, StoreCode } from '@smart-grocery/shared';
import type { Offer, OfferAssignment, Requirement } from './basket-optimizer.types';

const STRATEGIES: BasketStrategy[] = ['CHEAPEST', 'CONVENIENCE', 'DELIVERY', 'QUALITY'];
const DELIVERY_COVERAGE_RATIO = 0.6;

interface StoreDeliveryInfo {
  storeName: string;
  deliveryFeeCents: number;
  freeDeliveryMinCents: number | null;
}

/**
 * Pure basket optimization engine. No persistence inside the algorithm —
 * callers prepare Requirements and Offers, the optimizer returns
 * OptimizationResult objects matching the shared contract.
 */
@Injectable()
export class BasketOptimizerService {
  optimizeAll(
    requirements: Requirement[],
    offersByReq: Map<string, Offer[]>,
  ): OptimizationResult[] {
    const baseline = this.computeBaseline(requirements, offersByReq);
    return STRATEGIES.map((strategy) =>
      this.buildResult(strategy, requirements, this.assign(strategy, requirements, offersByReq), baseline),
    );
  }

  optimize(
    requirements: Requirement[],
    offersByReq: Map<string, Offer[]>,
    strategy: BasketStrategy,
  ): OptimizationResult {
    const baseline = this.computeBaseline(requirements, offersByReq);
    return this.buildResult(
      strategy,
      requirements,
      this.assign(strategy, requirements, offersByReq),
      baseline,
    );
  }

  // ---- pack & cost arithmetic ----

  /**
   * Packs needed to satisfy a requirement:
   * - known grams on both sides: ceil(requiredQtyG / packQtyG), at least 1
   * - piece packs without gram info (or unknown requirement): 1 pack
   */
  packsNeeded(requirement: Requirement, offer: Offer): number {
    if (
      requirement.requiredQtyG !== null &&
      requirement.requiredQtyG > 0 &&
      offer.packQtyG !== null &&
      offer.packQtyG > 0
    ) {
      return Math.max(1, Math.ceil(requirement.requiredQtyG / offer.packQtyG));
    }
    return 1;
  }

  private makeAssignment(requirement: Requirement, offer: Offer): OfferAssignment {
    const packs = this.packsNeeded(requirement, offer);
    return { offer, packs, costCents: packs * offer.priceCents };
  }

  private effectiveCost(requirement: Requirement, offer: Offer): number {
    return this.packsNeeded(requirement, offer) * offer.priceCents;
  }

  // ---- strategies ----

  private assign(
    strategy: BasketStrategy,
    requirements: Requirement[],
    offersByReq: Map<string, Offer[]>,
  ): Map<string, OfferAssignment> {
    switch (strategy) {
      case 'CHEAPEST':
        return this.assignCheapest(requirements, offersByReq);
      case 'CONVENIENCE':
        return this.assignConvenience(requirements, offersByReq);
      case 'DELIVERY':
        return this.assignDelivery(requirements, offersByReq);
      case 'QUALITY':
        return this.assignQuality(requirements, offersByReq);
    }
  }

  private assignCheapest(
    requirements: Requirement[],
    offersByReq: Map<string, Offer[]>,
    allowedStores?: Set<StoreCode>,
  ): Map<string, OfferAssignment> {
    const assignments = new Map<string, OfferAssignment>();
    for (const requirement of requirements) {
      const offers = (offersByReq.get(requirement.key) ?? []).filter(
        (o) => !allowedStores || allowedStores.has(o.storeCode),
      );
      let best: OfferAssignment | null = null;
      for (const offer of offers) {
        const assignment = this.makeAssignment(requirement, offer);
        if (!best || assignment.costCents < best.costCents) {
          best = assignment;
        }
      }
      if (best) {
        assignments.set(requirement.key, best);
      }
    }
    return assignments;
  }

  /**
   * Greedy set-cover minimizing the number of stores: repeatedly pick the
   * store covering the most uncovered requirements (tiebreak: lower added
   * cost), then buy each requirement at its cheapest offer within the
   * selected stores.
   */
  private assignConvenience(
    requirements: Requirement[],
    offersByReq: Map<string, Offer[]>,
  ): Map<string, OfferAssignment> {
    const matched = requirements.filter((r) => (offersByReq.get(r.key) ?? []).length > 0);
    const storeCoverage = new Map<StoreCode, Map<string, OfferAssignment>>();
    for (const requirement of matched) {
      for (const offer of offersByReq.get(requirement.key) ?? []) {
        let perStore = storeCoverage.get(offer.storeCode);
        if (!perStore) {
          perStore = new Map();
          storeCoverage.set(offer.storeCode, perStore);
        }
        const assignment = this.makeAssignment(requirement, offer);
        const existing = perStore.get(requirement.key);
        if (!existing || assignment.costCents < existing.costCents) {
          perStore.set(requirement.key, assignment);
        }
      }
    }

    const uncovered = new Set(matched.map((r) => r.key));
    const selectedStores = new Set<StoreCode>();
    while (uncovered.size > 0) {
      let bestStore: StoreCode | null = null;
      let bestCount = 0;
      let bestCost = Infinity;
      for (const [storeCode, perStore] of storeCoverage) {
        if (selectedStores.has(storeCode)) {
          continue;
        }
        let count = 0;
        let cost = 0;
        for (const [key, assignment] of perStore) {
          if (uncovered.has(key)) {
            count++;
            cost += assignment.costCents;
          }
        }
        if (count > bestCount || (count === bestCount && count > 0 && cost < bestCost)) {
          bestStore = storeCode;
          bestCount = count;
          bestCost = cost;
        }
      }
      if (!bestStore || bestCount === 0) {
        break;
      }
      selectedStores.add(bestStore);
      for (const key of storeCoverage.get(bestStore)!.keys()) {
        uncovered.delete(key);
      }
    }

    return this.assignCheapest(matched, offersByReq, selectedStores);
  }

  /**
   * Delivery-aware: evaluate each store covering >= 60% of matched
   * requirements as the primary; fill uncovered requirements from the single
   * cheapest complementary store (its delivery fee added likewise); pick the
   * minimum grand total combination, capped at 2 stores.
   */
  private assignDelivery(
    requirements: Requirement[],
    offersByReq: Map<string, Offer[]>,
  ): Map<string, OfferAssignment> {
    const matched = requirements.filter((r) => (offersByReq.get(r.key) ?? []).length > 0);
    if (matched.length === 0) {
      return new Map();
    }

    const storeOffers = this.cheapestPerStore(matched, offersByReq);
    const minCoverage = Math.ceil(matched.length * DELIVERY_COVERAGE_RATIO);
    const candidates = [...storeOffers.entries()].filter(
      ([, perStore]) => perStore.size >= minCoverage,
    );
    if (candidates.length === 0) {
      return this.assignCheapest(matched, offersByReq);
    }

    let bestAssignments: Map<string, OfferAssignment> | null = null;
    let bestGrand = Infinity;

    for (const [primaryCode, primary] of candidates) {
      const assignments = new Map<string, OfferAssignment>(primary);
      const uncoveredKeys = matched.map((r) => r.key).filter((k) => !assignments.has(k));

      if (uncoveredKeys.length > 0) {
        // single cheapest complementary store
        let bestComp: { code: StoreCode; covered: Map<string, OfferAssignment>; score: number } | null =
          null;
        for (const [compCode, comp] of storeOffers) {
          if (compCode === primaryCode) {
            continue;
          }
          const covered = new Map<string, OfferAssignment>();
          let cost = 0;
          for (const key of uncoveredKeys) {
            const assignment = comp.get(key);
            if (assignment) {
              covered.set(key, assignment);
              cost += assignment.costCents;
            }
          }
          if (covered.size === 0) {
            continue;
          }
          const delivery = this.deliveryForSubtotal(cost, comp);
          // Prefer more coverage, then lower cost incl. delivery.
          const candidateScore = cost + delivery;
          if (
            !bestComp ||
            covered.size > bestComp.covered.size ||
            (covered.size === bestComp.covered.size && candidateScore < bestComp.score)
          ) {
            bestComp = { code: compCode, covered, score: candidateScore };
          }
        }
        if (bestComp) {
          for (const [key, assignment] of bestComp.covered) {
            assignments.set(key, assignment);
          }
        }
      }

      const grand = this.grandTotal(assignments);
      if (grand < bestGrand) {
        bestGrand = grand;
        bestAssignments = assignments;
      }
    }

    return bestAssignments ?? this.assignCheapest(matched, offersByReq);
  }

  /** Per requirement: maximize qualityTier*2 + storeQualityScore, tiebreak lowest cost. */
  private assignQuality(
    requirements: Requirement[],
    offersByReq: Map<string, Offer[]>,
  ): Map<string, OfferAssignment> {
    const assignments = new Map<string, OfferAssignment>();
    for (const requirement of requirements) {
      const offers = offersByReq.get(requirement.key) ?? [];
      let best: OfferAssignment | null = null;
      let bestScore = -Infinity;
      for (const offer of offers) {
        const score = offer.qualityTier * 2 + offer.storeQualityScore;
        const assignment = this.makeAssignment(requirement, offer);
        if (
          score > bestScore ||
          (score === bestScore && best !== null && assignment.costCents < best.costCents)
        ) {
          best = assignment;
          bestScore = score;
        }
      }
      if (best) {
        assignments.set(requirement.key, best);
      }
    }
    return assignments;
  }

  // ---- shared helpers ----

  /** Map storeCode -> (reqKey -> cheapest assignment at that store). */
  private cheapestPerStore(
    requirements: Requirement[],
    offersByReq: Map<string, Offer[]>,
  ): Map<StoreCode, Map<string, OfferAssignment>> {
    const result = new Map<StoreCode, Map<string, OfferAssignment>>();
    for (const requirement of requirements) {
      for (const offer of offersByReq.get(requirement.key) ?? []) {
        let perStore = result.get(offer.storeCode);
        if (!perStore) {
          perStore = new Map();
          result.set(offer.storeCode, perStore);
        }
        const assignment = this.makeAssignment(requirement, offer);
        const existing = perStore.get(requirement.key);
        if (!existing || assignment.costCents < existing.costCents) {
          perStore.set(requirement.key, assignment);
        }
      }
    }
    return result;
  }

  private deliveryForSubtotal(
    subtotalCents: number,
    assignments: Map<string, OfferAssignment>,
  ): number {
    const first = assignments.values().next();
    if (first.done) {
      return 0;
    }
    const offer = first.value.offer;
    if (offer.freeDeliveryMinCents !== null && subtotalCents >= offer.freeDeliveryMinCents) {
      return 0;
    }
    return offer.deliveryFeeCents;
  }

  private grandTotal(assignments: Map<string, OfferAssignment>): number {
    const byStore = this.groupByStore(assignments);
    let total = 0;
    for (const group of byStore.values()) {
      total += group.subtotalCents + group.deliveryCents;
    }
    return total;
  }

  private groupByStore(assignments: Map<string, OfferAssignment>): Map<
    StoreCode,
    { info: StoreDeliveryInfo; itemCount: number; subtotalCents: number; deliveryCents: number }
  > {
    const byStore = new Map<
      StoreCode,
      { info: StoreDeliveryInfo; itemCount: number; subtotalCents: number; deliveryCents: number }
    >();
    for (const assignment of assignments.values()) {
      const { offer } = assignment;
      let group = byStore.get(offer.storeCode);
      if (!group) {
        group = {
          info: {
            storeName: offer.storeName,
            deliveryFeeCents: offer.deliveryFeeCents,
            freeDeliveryMinCents: offer.freeDeliveryMinCents,
          },
          itemCount: 0,
          subtotalCents: 0,
          deliveryCents: 0,
        };
        byStore.set(offer.storeCode, group);
      }
      group.itemCount++;
      group.subtotalCents += assignment.costCents;
    }
    for (const group of byStore.values()) {
      group.deliveryCents =
        group.info.freeDeliveryMinCents !== null &&
        group.subtotalCents >= group.info.freeDeliveryMinCents
          ? 0
          : group.info.deliveryFeeCents;
    }
    return byStore;
  }

  /**
   * Baseline for savings: mean grand total (incl. delivery) over single
   * stores that cover at least 60% of the matched requirements.
   */
  private computeBaseline(
    requirements: Requirement[],
    offersByReq: Map<string, Offer[]>,
  ): number | null {
    const matched = requirements.filter((r) => (offersByReq.get(r.key) ?? []).length > 0);
    if (matched.length === 0) {
      return null;
    }
    const storeOffers = this.cheapestPerStore(matched, offersByReq);
    const minCoverage = Math.ceil(matched.length * DELIVERY_COVERAGE_RATIO);
    const totals: number[] = [];
    for (const perStore of storeOffers.values()) {
      if (perStore.size < minCoverage) {
        continue;
      }
      let subtotal = 0;
      for (const assignment of perStore.values()) {
        subtotal += assignment.costCents;
      }
      totals.push(subtotal + this.deliveryForSubtotal(subtotal, perStore));
    }
    if (totals.length === 0) {
      return null;
    }
    return totals.reduce((a, b) => a + b, 0) / totals.length;
  }

  private buildResult(
    strategy: BasketStrategy,
    requirements: Requirement[],
    assignments: Map<string, OfferAssignment>,
    baseline: number | null,
  ): OptimizationResult {
    const byStore = this.groupByStore(assignments);

    const storeBreakdown: OptimizationResult['storeBreakdown'] = [...byStore.entries()].map(
      ([storeCode, group]) => ({
        storeCode,
        storeName: group.info.storeName,
        itemCount: group.itemCount,
        subtotalCents: group.subtotalCents,
        deliveryCents: group.deliveryCents,
      }),
    );

    const items: OptimizationResult['items'] = [];
    const unmatchedIngredients: string[] = [];
    for (const requirement of requirements) {
      const assignment = assignments.get(requirement.key);
      if (assignment) {
        items.push({
          ingredientName: requirement.name,
          requiredQtyG: requirement.requiredQtyG,
          quantity: assignment.packs,
          unitPriceCents: assignment.offer.priceCents,
          totalCents: assignment.costCents,
          isSubstitute: false,
          unmatched: false,
          product: assignment.offer.product,
        });
      } else {
        items.push({
          ingredientName: requirement.name,
          requiredQtyG: requirement.requiredQtyG,
          quantity: 0,
          unitPriceCents: 0,
          totalCents: 0,
          isSubstitute: false,
          unmatched: true,
          product: null,
        });
        unmatchedIngredients.push(requirement.name);
      }
    }

    const totalCents = storeBreakdown.reduce((sum, s) => sum + s.subtotalCents, 0);
    const deliveryCents = storeBreakdown.reduce((sum, s) => sum + s.deliveryCents, 0);
    const grandTotalCents = totalCents + deliveryCents;
    const savingsCents =
      baseline !== null ? Math.max(0, Math.round(baseline - grandTotalCents)) : 0;

    return {
      strategy,
      totalCents,
      deliveryCents,
      grandTotalCents,
      storeCount: storeBreakdown.length,
      savingsCents,
      storeBreakdown,
      items,
      unmatchedIngredients,
    };
  }
}
