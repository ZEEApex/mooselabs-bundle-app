import db from "../db.server";

export const action = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }
};

export const loader = async ({ params }) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  try {
    const bundles = await db.bundle.findMany({ where: { status: "ACTIVE" } });
    let matchedBundle = null;
    let config = null;

    for (const b of bundles) {
      if (b.configuration) {
        const parsedConfig = JSON.parse(b.configuration);
        if (parsedConfig.parentProduct && parsedConfig.parentProduct.id.includes(params.productId)) {
          matchedBundle = b;
          config = parsedConfig;
          break;
        }
      }
    }

    if (!matchedBundle) return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });

    const categories = [];
    config.steps.forEach(step => {
      step.categories.forEach(cat => {
        categories.push({
          id: cat.id,
          name: cat.name,
          title: cat.title,
          rule: cat.rule,
          products: cat.products.map(p => ({
            id: p.id,
            variantId: p.variantId,
            title: p.title,
            imageUrl: p.image,
            price: 10.00
          }))
        });
      });
    });

    // ✅ All 3 discount types mapped correctly
    const discountTypeRaw = config.discount?.type || "";
    const discountType = discountTypeRaw === "Percentage Off"   ? "PERCENTAGE"  :
                         discountTypeRaw === "Fixed Amount Off" ? "FIXED"       :
                         discountTypeRaw === "Fixed Bundle Price" ? "FIXED_PRICE" : "NONE";

    const responseData = {
      id: matchedBundle.id,
      name: matchedBundle.name,
      parentVariantId: config.parentProduct.variantId,
      discountType,
      discountValue:   parseFloat(config.discount?.value || 0),
      discountEnabled: config.discount?.enabled !== false,
      discountMessage: config.discount?.ruleText || "",
      successMessage:  config.discount?.successMessage || "",
      categories
    };

    return Response.json(responseData, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: "Server error" }, { status: 500, headers: corsHeaders });
  }
};