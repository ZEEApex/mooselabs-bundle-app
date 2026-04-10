// @ts-check
/**
 * @typedef {import("../generated/api").RunInput} RunInput
 * @typedef {import("../generated/api").FunctionRunResult} FunctionRunResult
 */
 
// @ts-check

export function cartTransformRun(input) {
  const operations = [];

  if (!input.cart?.lines) return { operations: [] };

  input.cart.lines.forEach((line) => {
    const bId           = line.bundleId?.value;
    const componentsRaw = line.components?.value;
    const bundleName    = line.bundleName?.value;

    if (!bId || !componentsRaw) return;

    let components;
    try { components = JSON.parse(componentsRaw); }
    catch(e) { return; }

    if (!components || components.length === 0) return;

    const expandedCartItems = components.map(c => ({
      merchandiseId: `gid://shopify/ProductVariant/${c.variantId}`,
      quantity: c.quantity,
      attributes: [
        { key: "Box",         value: c.box || "1" },
        // ✅ Pass bundle name to EVERY expanded line item
        // This is the only way analytics can identify which bundle each order item belongs to
        { key: "_bundleName", value: bundleName || "Custom Bundle" }
      ],
      ...(c.price && parseFloat(c.price) >= 0 ? {
        price: {
          adjustment: {
            fixedPricePerUnit: {
              amount: String(parseFloat(c.price).toFixed(2))
            }
          }
        }
      } : {})
    }));

    operations.push({
      expand: {
        cartLineId:        line.id,
        title:             bundleName || "Custom Bundle",
        expandedCartItems: expandedCartItems
      }
    });
  });

  return { operations };
}