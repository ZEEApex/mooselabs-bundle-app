import { DiscountClass, OrderDiscountSelectionStrategy } from "../generated/api";

const NO_DISCOUNT = { operations: [] };

/**
 * @param {import("../generated/api").CartInput} input
 * @returns {import("../generated/api").CartLinesDiscountsGenerateRunResult}
 */
export function cartLinesDiscountsGenerateRun(input) {
  const lines = input.cart.lines;
  if (!lines.length) return NO_DISCOUNT;

  // Only act when the discount was created as an Order-class discount.
  if (!(input.discount.discountClasses || []).includes(DiscountClass.Order)) {
    return NO_DISCOUNT;
  }

  const config = input.discount.metafield?.jsonValue ?? {};
  const percentage = Number(config.percentage ?? 0);
  if (!(percentage > 0 && percentage <= 100)) return NO_DISCOUNT;

  // Eligible = a product in one of the configured collections (Shop Moose Labs).
  // Everything else (bundles, gift sets, Shipping Protection, gift cards) is left out.
  const isEligible = (line) =>
    line.merchandise.__typename === "ProductVariant" &&
    line.merchandise.product?.inAnyCollection === true;

  const excludedCartLineIds = lines.filter((l) => !isEligible(l)).map((l) => l.id);

  // Nothing eligible in the cart: don't apply (a bundles-only cart gets no PBF26).
  if (excludedCartLineIds.length === lines.length) return NO_DISCOUNT;

  return {
    operations: [
      {
        orderDiscountsAdd: {
          candidates: [
            {
              message: config.message || `${percentage}% off`,
              targets: [{ orderSubtotal: { excludedCartLineIds } }],
              value: { percentage: { value: percentage } },
            },
          ],
          selectionStrategy: OrderDiscountSelectionStrategy.First,
        },
      },
    ],
  };
}
