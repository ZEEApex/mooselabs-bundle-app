// Entry point for the function bundle.
// Re-exports the target run function so the Shopify CLI detects this as a
// JavaScript function (required for `shopify app function typegen`/build).
export { cartLinesDiscountsGenerateRun } from "./cart_lines_discounts_generate_run.js";
