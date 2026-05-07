import { json } from "@remix-run/node";
import { unauthenticated } from "../shopify.server";

export const action = async ({ request }) => {
  // Handle CORS so the storefront browser doesn't block the request
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const { variantIds } = await request.json();

  if (!shop || !variantIds || variantIds.length === 0) {
    return json({ hiddenVariants: [] }, { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  try {
    // Securely connect to the Shopify Admin API for this specific store
    const { admin } = await unauthenticated.admin(shop);
    
    // Format the IDs for GraphQL (e.g., gid://shopify/ProductVariant/123456)
    const gids = variantIds.map(id => String(id).includes('gid://') ? id : `gid://shopify/ProductVariant/${id}`);
    
    // Bulk query the metafields for all requested variants at once!
    const response = await admin.graphql(`
      query {
        nodes(ids: ${JSON.stringify(gids)}) {
          ... on ProductVariant {
            id
            metafield(namespace: "custom", key: "hide_variant") {
              value
            }
          }
        }
      }
    `);

    const data = await response.json();
    const hiddenVariants = [];

    // Filter out the ones where the metafield is true
    if (data.data && data.data.nodes) {
      data.data.nodes.forEach(node => {
        if (node && node.metafield && node.metafield.value === "true") {
          hiddenVariants.push(node.id.split('/').pop()); // Keep just the numeric ID
        }
      });
    }

    return json({ hiddenVariants }, {
      headers: { "Access-Control-Allow-Origin": "*" }
    });

  } catch (err) {
    console.error("Metafield fetch error:", err);
    return json({ hiddenVariants: [] }, { headers: { "Access-Control-Allow-Origin": "*" } });
  }
};