// @ts-check

/**
 * @typedef {import("../generated/api").RunInput} RunInput
 * @typedef {import("../generated/api").FunctionRunResult} FunctionRunResult
 * @typedef {import("../generated/api").CartOperation} CartOperation
 */

/**
 * @param {RunInput} input
 * @returns {FunctionRunResult}
 */
export function run(input) {
  const groupedLines = {};

  // 1. Loop through all items in the cart
  input.cart.lines.forEach((line) => {
    const bundleId = line.bundleId?.value;
    const parentVariantId = line.parentVariantId?.value;
    const bundleName = line.bundleName?.value || "Custom Bundle";

    // 2. If the item has a _bundleId, group it with other items sharing that ID
    if (bundleId && parentVariantId) {
      if (!groupedLines[bundleId]) {
        groupedLines[bundleId] = {
          parentVariantId: parentVariantId,
          title: "bundlebuilder",
          cartLines: []
        };
      }
      
      groupedLines[bundleId].cartLines.push({
        cartLineId: line.id,
        quantity: line.quantity
      });
    }
  });

  const operations = [];

  // 3. For every group we found, create a "Merge" operation
  for (const bundleId in groupedLines) {
    const group = groupedLines[bundleId];
    
    if (group.cartLines.length > 0) {
      operations.push({
        merge: {
          cartLines: group.cartLines,
          parentVariantId: group.parentVariantId,
          title: group.title
        }
      });
    }
  }

  // 4. Return the instructions back to Shopify
  return {
    operations: operations
  };
}