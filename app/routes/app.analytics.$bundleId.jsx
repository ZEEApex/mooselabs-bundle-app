import { useLoaderData, useNavigate, useSearchParams } from "react-router";
import { Page, Card, BlockStack, Text, DataTable, Select, InlineGrid } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "30");

  const bundle = await db.bundle.findUnique({ where: { id: params.bundleId } });
  if (!bundle) throw new Response("Not found", { status: 404 });

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  let orders = [];
  try {
    let fetchUrl = `https://${session.shop}/admin/api/2024-04/orders.json?status=any&limit=250&created_at_min=${cutoffDate.toISOString()}`;
    let pages = 0;
    while (fetchUrl && pages < 5) {
      const response = await fetch(fetchUrl, {
        headers: {
          "X-Shopify-Access-Token": session.accessToken,
          "Content-Type": "application/json"
        }
      });
      const json = await response.json();
      if (json.orders) orders = orders.concat(json.orders);
      
      const linkHeader = response.headers.get("Link");
      fetchUrl = null;
      if (linkHeader) {
        const links = linkHeader.split(",");
        const nextLink = links.find(link => link.includes('rel="next"'));
        if (nextLink) {
          const match = nextLink.match(/<([^>]+)>/);
          if (match) fetchUrl = match[1];
        }
      }
      pages++;
    }
  } catch(e) { 
    console.error("REST Orders fetch error:", e); 
  }

  const bundleOrders = [];
  const targetName = bundle.name.trim().toLowerCase();
  
  orders.forEach(order => {
    if (!order.line_items) return;

    let bundleFoundInOrder = false;
    let bundleRevenue = 0;

    order.line_items.forEach(item => {
      let props = item.properties || [];
      if (typeof props === 'object' && !Array.isArray(props)) {
        props = Object.keys(props).map(k => ({ name: k, value: props[k] }));
      }

      let isMatch = false;
      const itemTitle = String(item.title || '').toLowerCase();
      const itemName = String(item.name || '').toLowerCase();
      const itemVarId = String(item.variant_id || item.variant?.id || item.merchandise?.id || '');

      // 1. Title match
      if (itemTitle.includes(targetName) || itemName.includes(targetName)) {
        isMatch = true;
      }

      // 2. Variant ID match
      if (!isMatch && bundle.parentVariantId && itemVarId) {
        const numParentId = String(bundle.parentVariantId).split('/').pop();
        if (itemVarId === numParentId) isMatch = true;
      }

      // 3. Properties Match
      if (!isMatch && Array.isArray(props)) {
        for (const p of props) {
          const pVal = String(p.value || '').toLowerCase();
          if (pVal === targetName || pVal.includes(targetName)) {
            isMatch = true;
            break;
          }
        }
      }

      if (isMatch) {
        bundleFoundInOrder = true;
        bundleRevenue += parseFloat(item.price || 0) * parseInt(item.quantity || 1);
      }
    });

    if (bundleFoundInOrder) {
      const orderTotal = parseFloat(order.current_total_price || order.total_price || 0);
      bundleOrders.push({
        id: order.id, name: order.name, date: new Date(order.created_at).toLocaleDateString(),
        orderValue: orderTotal,
        bundleValue: bundleRevenue,
        bundleShare: ((bundleRevenue / (orderTotal || 1)) * 100).toFixed(1)
      });
    }
  });

  const totalRevenue = bundleOrders.reduce((s, o) => s + o.bundleValue, 0);
  const totalOrders  = bundleOrders.length;
  const aov          = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const orderAov     = totalOrders > 0 ? bundleOrders.reduce((s, o) => s + o.orderValue, 0) / totalOrders : 0;

  return { bundle, bundleOrders, totals: { revenue: totalRevenue, orders: totalOrders, aov, orderAov }, days };
};

export default function BundleAnalytics() {
  const { bundle, bundleOrders, totals, days } = useLoaderData();
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();

  const rows = bundleOrders.map(o => [
    o.name, o.date, `$${o.orderValue.toFixed(2)}`, `$${o.bundleValue.toFixed(2)}`, `${o.bundleShare}%`
  ]);

  return (
    <Page title={bundle.name} backAction={{ content: 'Analytics', onAction: () => navigate('/app/analytics') }} primaryAction={
        <Select labelHidden label="Date range" value={String(days)} onChange={(val) => setSearchParams({ days: val })}
          options={[{ label: 'Last 7 Days', value: '7' }, { label: 'Last 30 Days', value: '30' }, { label: 'Last 60 Days', value: '60' }]}
        />
      }
    >
      <BlockStack gap="500">
        <InlineGrid columns="1fr 1fr 1fr 1fr" gap="400">
          {[
            { label: 'Bundle Revenue', value: `$${totals.revenue.toFixed(2)}` },
            { label: 'Bundle Orders', value: totals.orders },
            { label: 'Bundle AOV', value: `$${totals.aov.toFixed(2)}` },
            { label: 'Order AOV', value: `$${totals.orderAov.toFixed(2)}` },
          ].map((s, i) => (
            <Card key={i}>
              <BlockStack gap="100">
                <Text variant="bodyMd" tone="subdued">{s.label}</Text>
                <Text variant="headingXl" as="p">{s.value}</Text>
              </BlockStack>
            </Card>
          ))}
        </InlineGrid>

        <Card padding="0">
          <DataTable columnContentTypes={['text', 'text', 'numeric', 'numeric', 'numeric']} headings={['Order', 'Date', 'Order Value', 'Bundle Value', 'Bundle Share']} rows={rows} footerContent={rows.length === 0 ? "No orders found for this period." : undefined} />
        </Card>
      </BlockStack>
    </Page>
  );
}