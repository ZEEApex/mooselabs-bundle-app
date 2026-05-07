import shopify from "../shopify.server";

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
  
  let variantIds = [];
  try {
    const body = await request.json();
    variantIds = body.variantIds || [];
  } catch (e) {
    return Response.json({ hiddenVariants: [] }, { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  if (!shop || variantIds.length === 0) {
    return Response.json({ hiddenVariants: [] }, { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  try {
    const { admin } = await shopify.unauthenticated.admin(shop);
    const gids = variantIds.map(id => String(id).includes('gid://') ? id : `gid://shopify/ProductVariant/${id}`);
    
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

    if (data.data && data.data.nodes) {
      data.data.nodes.forEach(node => {
        // 🚨 THE FIX: Make it case-insensitive and handle any spaces!
        if (node && node.metafield && node.metafield.value != null) {
          const val = String(node.metafield.value).toLowerCase().trim();
          if (val === "true" || val === "1") {
            hiddenVariants.push(node.id.split('/').pop());
          }
        }
      });
    }

    return Response.json({ hiddenVariants }, {
      headers: { "Access-Control-Allow-Origin": "*" }
    });

  } catch (err) {
    console.error("Metafield fetch error:", err);
    return Response.json({ hiddenVariants: [] }, { headers: { "Access-Control-Allow-Origin": "*" } });
  }
};